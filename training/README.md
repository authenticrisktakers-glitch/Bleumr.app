# JUMARI 6B — Fine-Tuning Guide

Train your own local JUMARI model that runs offline on your MacBook Pro via Ollama.

## What You're Building

- **Base model:** Qwen2.5-7B-Instruct (7 billion parameters)
- **Method:** QLoRA fine-tuning (trains only ~2% of weights, fits on 1 GPU)
- **Result:** A ~4GB quantized model with JUMARI's personality baked in
- **Runs on:** Your 2015 MacBook Pro (16GB RAM) via Ollama

## Files

| File | What It Does |
|------|-------------|
| `jumari_dataset.jsonl` | Training data — 500+ examples of JUMARI being JUMARI |
| `train.py` | Fine-tuning script — run this on Vast.ai |
| `convert_to_gguf.sh` | Converts trained model to Ollama format |
| `Modelfile` | Ollama config — tells Ollama how to run JUMARI |
| `requirements.txt` | Python packages needed for training |

## Step-by-Step

### 1. Rent a GPU on Vast.ai (~$0.20/hr)

1. Go to [vast.ai](https://vast.ai) and create an account
2. Add $5-10 credit (training takes ~1-2 hours = ~$0.50)
3. Click **Search** and filter:
   - GPU: RTX 3090 or RTX 4090 (24GB VRAM)
   - Image: `pytorch/pytorch:2.2.0-cuda12.1-cudnn8-devel`
   - Disk: 80GB+
4. Rent the cheapest one

### 2. Upload Training Files

Once your instance is running, open the terminal (or SSH in):

```bash
# Create workspace
mkdir -p /workspace/jumari && cd /workspace/jumari

# Upload these files (use Vast.ai file manager or scp):
# - jumari_dataset.jsonl
# - train.py
# - convert_to_gguf.sh
# - Modelfile
# - requirements.txt
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Run Training

```bash
python train.py
```

Default settings work great. Training takes ~1-2 hours on an RTX 3090.

Optional flags:
```bash
python train.py --epochs 3           # fewer epochs (faster, less overfitting)
python train.py --lr 2e-4            # higher learning rate
python train.py --base mistralai/Mistral-7B-Instruct-v0.3  # use Mistral instead
```

### 5. Convert to GGUF

After training finishes:

```bash
chmod +x convert_to_gguf.sh
./convert_to_gguf.sh
```

This produces `jumari-7b-Q4_K_M.gguf` (~4GB file).

### 6. Download to Your Mac

Download `jumari-7b-Q4_K_M.gguf` and `Modelfile` to your Mac:
```bash
# From your Mac terminal:
scp root@YOUR_VAST_IP:/workspace/jumari/jumari-7b-Q4_K_M.gguf ~/Desktop/
scp root@YOUR_VAST_IP:/workspace/jumari/Modelfile ~/Desktop/
```

### 7. Install Ollama on Your Mac

```bash
# Download from ollama.ai or:
curl -fsSL https://ollama.ai/install.sh | sh
```

### 8. Create & Run JUMARI

```bash
cd ~/Desktop
ollama create jumari -f Modelfile
ollama run jumari
```

That's it. JUMARI now runs 100% locally on your MacBook Pro. No internet needed.

## Estimated Costs

| Item | Cost |
|------|------|
| Vast.ai GPU (2 hours) | ~$0.50 |
| Total | **~$0.50** |

## Troubleshooting

**"CUDA out of memory"**
- Reduce batch size: `python train.py --batch 2`
- Or reduce sequence length: `python train.py --max-len 1024`

**Training loss not decreasing**
- Try higher learning rate: `python train.py --lr 2e-4`
- Check dataset for formatting errors

**Ollama says model is too large**
- Use smaller quantization: change `Q4_K_M` to `Q4_0` in convert script
- Or try: `./convert_to_gguf.sh ./jumari-7b-merged ./jumari-Q4_0.gguf Q4_0`

**Model sounds generic / not like JUMARI**
- Add more training examples to the dataset
- Train for more epochs: `python train.py --epochs 8`
- Increase LoRA rank: `python train.py --lora-r 128 --lora-alpha 256`
