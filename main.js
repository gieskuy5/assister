const { Keypair } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const fs = require('fs');
const fetch = require('node-fetch');

// ASCII banner
const banner = `
               _     __             
 ___ ____ ___ (_)__ / /____ ________
/ _ \`(_-<(_-</ (_-</ __/ -_) __/ __/
\\_,_/___/___/_/___/\\__/\\__/_/ /_/   
`;

// Function to add color to text
function colorText(text, color = '36') {
    return `\x1b[${color}m${text}\x1b[0m`;
}

// Function to format time remaining
function formatTimeRemaining(milliseconds) {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

// Function to format date
function formatDate(date) {
    return date.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(',', '');
}

// Function to read accounts from file
async function readAccountsFromFile() {
    try {
        if (!fs.existsSync('accounts.txt')) {
            console.log(colorText('accounts.txt not found. Creating sample file...', '33'));
            fs.writeFileSync('accounts.txt', '# Format: One private key per line\n# Lines starting with # are comments');
            throw new Error('Please add your private keys to accounts.txt');
        }

        const content = fs.readFileSync('accounts.txt', 'utf-8');
        const accounts = content.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));

        if (accounts.length === 0) {
            throw new Error('No accounts found in accounts.txt');
        }

        return accounts;
    } catch (error) {
        console.error(colorText('Error reading accounts: ' + error, '31'));
        process.exit(1);
    }
}

// Function to claim daily points
async function claimDaily(accessToken, username) {
    try {
        const response = await fetch('https://api.assisterr.ai/incentive/users/me/daily_points/', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'Origin': 'https://build.assisterr.ai',
                'Referer': 'https://build.assisterr.ai/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Status: ${response.status}`);
        }

        const result = await response.json();
        console.log(colorText(`| SUCCESS | Daily claim success | Rewards - ${result.points - result.previous_points}`, '32'));

        return result;
    } catch (error) {
        console.error(colorText(`| ERROR   | Daily claim failed for ${username}: ${error}`, '31'));
        return null;
    }
}

// Main login function
async function loginWithSolanaWallet(privateKeyBase58, accountIndex) {
    try {
        const privateKey = bs58.decode(privateKeyBase58);
        const keypair = Keypair.fromSecretKey(privateKey);
        
        const messageResponse = await fetch('https://api.assisterr.ai/incentive/auth/login/get_message/', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Origin': 'https://build.assisterr.ai',
                'Referer': 'https://build.assisterr.ai/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
            }
        });
        
        const message = await messageResponse.text();
        const messageBytes = Buffer.from(message.replace(/['"]+/g, ''));
        const signature = nacl.sign.detached(messageBytes, privateKey);
        const signatureBase58 = bs58.encode(signature);
        
        const loginResponse = await fetch('https://api.assisterr.ai/incentive/auth/login/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': 'https://build.assisterr.ai',
                'Referer': 'https://build.assisterr.ai/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({
                message: message.replace(/['"]+/g, ''),
                signature: signatureBase58,
                key: keypair.publicKey.toBase58()
            })
        });
        
        const loginData = await loginResponse.json();
        
        console.log(colorText('| INFO    | Login Successfully', '36'));
        console.log(colorText(`| INFO    | Wallet ${accountIndex + 1} | ${loginData.user.wallet_id}`, '36'));
        console.log(colorText(`| INFO    | Username    : ${loginData.user.username}`, '36'));
        console.log(colorText(`| INFO    | Points      : ${loginData.user.points}`, '36'));
        
        // Immediately claim daily after successful login
        await claimDaily(loginData.access_token, loginData.user.username);
        
        return loginData;
        
    } catch (error) {
        console.error(colorText(`| ERROR   | Login failed for account ${accountIndex + 1}: ${error}`, '31'));
        return null;
    }
}

// Function to process all accounts
async function processAccounts(accounts) {
    for (let i = 0; i < accounts.length; i++) {
        await loginWithSolanaWallet(accounts[i], i);
        if (i < accounts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

// Function to display countdown timer
function startCountdown(nextRunTime) {
    const intervalId = setInterval(() => {
        const now = new Date().getTime();
        const timeRemaining = nextRunTime - now;
        
        if (timeRemaining <= 0) {
            clearInterval(intervalId);
            return;
        }

        process.stdout.write('\r\x1b[K');
        process.stdout.write(
            `Next Run        : ${formatDate(new Date(nextRunTime))}\n` +
            `Time Remaining  : ${formatTimeRemaining(timeRemaining)}`
        );
    }, 1000);
    
    return intervalId;
}

// Main function
async function main() {
    try {
        console.clear();
        console.log(colorText(banner));
        console.log('===============================================');
        console.log('GitHub  : https://github.com/gieskuy5');
        console.log('Telegram: https://t.me/giemdfk');
        console.log('===============================================');
        
        const accounts = await readAccountsFromFile();
        console.log(colorText(`Found ${accounts.length} accounts to process...\n`, '36'));
        
        while (true) {
            // Process all accounts
            await processAccounts(accounts);
            console.log('\n');
            
            // Calculate next run time (12 hours from now)
            const nextRunTime = new Date().getTime() + (12 * 60 * 60 * 1000);
            
            // Start countdown timer
            const countdownInterval = startCountdown(nextRunTime);
            
            // Wait for 12 hours
            await new Promise(resolve => setTimeout(resolve, 12 * 60 * 60 * 1000));
            
            // Clear countdown interval
            clearInterval(countdownInterval);
            console.log('\n\n');
        }
        
    } catch (error) {
        console.error(colorText('Fatal error: ' + error, '31'));
        process.exit(1);
    }
}

// Error handling
process.on('uncaughtException', (err) => {
    console.error(colorText('Uncaught Exception: ' + err, '31'));
});

// Run main program
main();