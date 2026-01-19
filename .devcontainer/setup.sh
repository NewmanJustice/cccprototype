#!/usr/bin/env bash
set -e

# Install NVM (Node Version Manager)
echo "Installing NVM..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Install and use Node.js LTS version
echo "Installing Node.js LTS..."
nvm install --lts
nvm use --lts

# Verify installations
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Install Claude CLI
echo "Installing Claude CLI..."
npm install -g @anthropic-ai/claude-code

# Verify Claude CLI installation
echo "Claude CLI version: $(claude --version)"

# Optional: ensure Playwright browsers are installed globally
#npx playwright install --with-deps

# Install kubelogin for AKS authentication
echo "Installing kubelogin..."
KUBELOGIN_VERSION=$(curl -s https://api.github.com/repos/Azure/kubelogin/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
curl -sSL "https://github.com/Azure/kubelogin/releases/download/${KUBELOGIN_VERSION}/kubelogin-linux-amd64.zip" -o /tmp/kubelogin.zip
unzip -q /tmp/kubelogin.zip -d /tmp
sudo mv /tmp/bin/linux_amd64/kubelogin /usr/local/bin/
sudo chmod +x /usr/local/bin/kubelogin
rm -rf /tmp/kubelogin.zip /tmp/bin
echo "✅ kubelogin ${KUBELOGIN_VERSION} installed"

# Configure bash history for unlimited size
echo "Configuring bash history..."
cat >> /home/vscode/.bashrc << 'EOF'

# Unlimited bash history
HISTSIZE=-1
HISTFILESIZE=-1
EOF
echo "✅ Bash history configured"

echo "✅ Dev container setup complete."