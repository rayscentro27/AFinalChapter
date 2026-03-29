# SSH Key Setup - Manual Steps

If the script doesn't work, follow these manual steps:

## Step 1: Verify Your SSH Key Exists

```powershell
# Check if key exists
Test-Path C:\Users\raysc\.ssh\id_tailscale.pub
Test-Path C:\Users\raysc\.ssh\id_tailscale
```

Should both return `True`

## Step 2: Copy Your Public Key Content

```powershell
# Display your public key (copy this output)
Get-Content C:\Users\raysc\.ssh\id_tailscale.pub
```

You'll see something like:
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... raysc-windows-to-macmini-tailscale
```

**Copy the entire line** (Ctrl+C)

## Step 3: SSH into Mac Mini with Password

```powershell
# This is the ONE time you'll need your Mac Mini password
ssh raysc@100.89.219.10
```

When prompted, enter your Mac Mini password

## Step 4: Add Your Public Key (on Mac Mini terminal)

Once logged in to Mac Mini:

```bash
# Create .ssh directory if needed
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Add your public key
echo "paste-your-public-key-here" >> ~/.ssh/authorized_keys

# Fix permissions
chmod 600 ~/.ssh/authorized_keys

# Verify it worked
cat ~/.ssh/authorized_keys
```

You should see your public key in the file

## Step 5: Logout and Test

On Mac Mini terminal:
```bash
exit
```

Back on Windows PowerShell:
```powershell
# Test key-based auth (should NOT ask for password)
ssh -i C:\Users\raysc\.ssh\id_tailscale raysc@100.89.219.10 "whoami"
```

Should output: `raysc` (no password prompt)

## If It Didn't Work

Common issues:
- **Wrong permissions**: `chmod 600 ~/.ssh/authorized_keys`
- **Public key pasted wrong**: Check for extra spaces or line breaks
- **Wrong key file used**: Make sure using `id_tailscale` not `id_rsa`
- **Firewall**: Is Mac Mini SSH daemon running? Try: `sudo systemsetup -setremotelogin on`

## Easiest: Use the Script

If manual is tedious, the PowerShell script automates all this:

```powershell
cd C:\Users\raysc\AFinalChapter
.\setup-ssh-auth.ps1
```

That's it! One command, prompts for password once, done.
