#!/usr/bin/env python3
"""
JUMARI 6B — Fine-Tuning Script for Vast.ai
============================================
Fine-tunes Qwen2.5-7B-Instruct with QLoRA on JUMARI's personality dataset.
Produces a merged model ready for GGUF conversion → Ollama.

Usage:
  python train.py                          # defaults (Qwen 7B, 5 epochs)
  python train.py --base mistralai/Mistral-7B-Instruct-v0.3
  python train.py --epochs 3 --lr 2e-4
  python train.py --resume checkpoints/checkpoint-500
"""

import argparse
import json
import os
import torch
from datasets import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, PeftModel
from trl import SFTTrainer, SFTConfig


# ── Defaults ──────────────────────────────────────────────────────────────────

DEFAULT_BASE = "Qwen/Qwen2.5-7B-Instruct"
DEFAULT_DATASET = "jumari_dataset.jsonl"
DEFAULT_OUTPUT = "./jumari-7b-lora"
DEFAULT_MERGED = "./jumari-7b-merged"


def load_dataset_jsonl(path: str) -> Dataset:
    """Load JSONL training data → HuggingFace Dataset."""
    examples = []
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                examples.append(obj)
            except json.JSONDecodeError as e:
                print(f"  ⚠ Skipping line {i+1}: {e}")
    print(f"  Loaded {len(examples)} training examples from {path}")
    return Dataset.from_list(examples)


def format_chat(example, tokenizer):
    """Convert messages array → tokenizer's chat template string."""
    messages = example["messages"]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
    return {"text": text}


def main():
    parser = argparse.ArgumentParser(description="JUMARI Fine-Tuning")
    parser.add_argument("--base", default=DEFAULT_BASE, help="Base model HF ID")
    parser.add_argument("--dataset", default=DEFAULT_DATASET, help="JSONL dataset path")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="LoRA adapter output dir")
    parser.add_argument("--merged", default=DEFAULT_MERGED, help="Merged model output dir")
    parser.add_argument("--epochs", type=int, default=5, help="Training epochs")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate")
    parser.add_argument("--batch", type=int, default=4, help="Per-device batch size")
    parser.add_argument("--grad-accum", type=int, default=4, help="Gradient accumulation steps")
    parser.add_argument("--max-len", type=int, default=2048, help="Max sequence length")
    parser.add_argument("--lora-r", type=int, default=64, help="LoRA rank")
    parser.add_argument("--lora-alpha", type=int, default=128, help="LoRA alpha")
    parser.add_argument("--resume", default=None, help="Resume from checkpoint path")
    parser.add_argument("--no-merge", action="store_true", help="Skip merge step")
    parser.add_argument("--wandb", action="store_true", help="Enable W&B logging")
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("  JUMARI 6B — Fine-Tuning Pipeline")
    print("=" * 60)
    print(f"  Base model:  {args.base}")
    print(f"  Dataset:     {args.dataset}")
    print(f"  Epochs:      {args.epochs}")
    print(f"  LR:          {args.lr}")
    print(f"  Batch:       {args.batch} x {args.grad_accum} accum = {args.batch * args.grad_accum} effective")
    print(f"  Max length:  {args.max_len}")
    print(f"  LoRA:        r={args.lora_r}, alpha={args.lora_alpha}")
    print(f"  Output:      {args.output}")
    print("=" * 60 + "\n")

    # ── 1. Load dataset ───────────────────────────────────────────────────────
    print("📦 Loading dataset...")
    dataset = load_dataset_jsonl(args.dataset)

    # ── 2. Load tokenizer ─────────────────────────────────────────────────────
    print("📖 Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(args.base, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.pad_token_id = tokenizer.eos_token_id

    # ── 3. Format dataset with chat template ──────────────────────────────────
    print("🔄 Formatting dataset with chat template...")
    dataset = dataset.map(lambda x: format_chat(x, tokenizer), remove_columns=dataset.column_names)
    print(f"  Sample (first 200 chars): {dataset[0]['text'][:200]}...")

    # ── 4. Load model with 4-bit quantization ─────────────────────────────────
    print("🧠 Loading base model (4-bit quantized)...")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )

    model = AutoModelForCausalLM.from_pretrained(
        args.base,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
        attn_implementation="flash_attention_2" if torch.cuda.is_available() else "eager",
    )
    model = prepare_model_for_kbit_training(model)

    # ── 5. Configure LoRA ─────────────────────────────────────────────────────
    print("🔧 Applying LoRA adapter...")
    # Target modules vary by architecture — these cover Qwen, Mistral, Llama
    target_modules = [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ]

    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=target_modules,
    )

    model = get_peft_model(model, lora_config)
    trainable, total = model.get_nb_trainable_parameters()
    print(f"  Trainable: {trainable:,} / {total:,} ({100 * trainable / total:.2f}%)")

    # ── 6. Training config ────────────────────────────────────────────────────
    print("⚡ Configuring training...")

    report_to = "wandb" if args.wandb else "none"

    training_args = SFTConfig(
        output_dir=args.output,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        weight_decay=0.01,
        bf16=True,
        logging_steps=5,
        save_strategy="steps",
        save_steps=100,
        save_total_limit=3,
        max_seq_length=args.max_len,
        packing=True,           # pack short examples into single sequences for efficiency
        dataset_text_field="text",
        report_to=report_to,
        run_name="jumari-6b-finetune" if args.wandb else None,
        seed=42,
    )

    # ── 7. Train! ─────────────────────────────────────────────────────────────
    print("\n🚀 Starting training...\n")

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        processing_class=tokenizer,
    )

    if args.resume:
        print(f"  Resuming from {args.resume}")
        trainer.train(resume_from_checkpoint=args.resume)
    else:
        trainer.train()

    # Save final LoRA adapter
    print(f"\n💾 Saving LoRA adapter to {args.output}...")
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)

    # ── 8. Merge LoRA → full model ────────────────────────────────────────────
    if not args.no_merge:
        print(f"\n🔀 Merging LoRA weights into base model...")
        print(f"  Loading base model (full precision for merge)...")

        # Reload base in fp16 for clean merge
        base_model = AutoModelForCausalLM.from_pretrained(
            args.base,
            torch_dtype=torch.float16,
            device_map="auto",
            trust_remote_code=True,
        )

        # Load and merge LoRA
        merged_model = PeftModel.from_pretrained(base_model, args.output)
        merged_model = merged_model.merge_and_unload()

        print(f"  Saving merged model to {args.merged}...")
        merged_model.save_pretrained(args.merged)
        tokenizer.save_pretrained(args.merged)

        print(f"\n✅ Done! Merged model at: {args.merged}")
        print(f"   Next step: convert to GGUF with llama.cpp")
        print(f"   Then: ollama create jumari -f Modelfile")
    else:
        print(f"\n✅ Done! LoRA adapter at: {args.output}")

    print("\n" + "=" * 60)
    print("  JUMARI training complete!")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
