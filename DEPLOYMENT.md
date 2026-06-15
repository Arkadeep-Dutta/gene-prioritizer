# GenePrioritizer — Complete Deployment Guide

This guide takes you from zero to a fully hosted, production-ready gene prioritization system.
Follow the steps in order. Each section is independent — you can stop after Phase 1 and have
a working app, then add optional services later.

---

## ✅ PHASE 1 — Core Setup (Required — ~20 minutes)

### Step 1.1 — Install Prerequisites

You need Node.js 20+ and Git on your computer.

- **Node.js**: Go to https://nodejs.org → click "LTS" → download and install for your OS.
  When done, open a terminal and run: `node --version` — it should print v20.x.x or higher.

- **Git**: Go to https://git-scm.com/downloads → download for your OS → install.
  When done run: `git --version` — it should print a version number.

- **VS Code (recommended editor)**: https://code.visualstudio.com — download and install.

---

### Step 1.2 — Get Your Free Gemini API Key

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with your Google account (or create one — it's free)
3. Click the blue **"Create API key"** button in the top left area
4. In the dialog that appears, select **"Create API key in new project"**
5. Copy the key that appears — it starts with `AIza...`
   - ⚠️ Keep this key private. Never commit it to GitHub.

---

### Step 1.3 — Set Up the Project on Your Computer

Open a terminal (Mac: press Cmd+Space → type "Terminal" → Enter; Windows: press Win+R → type "cmd" → Enter).

Run these commands one at a time, pressing Enter after each:

```bash
# 1. Create the Next.js project scaffold
npx create-next-app@latest gene-prioritizer --typescript --app --no-tailwind --eslint
# When prompted:
#   Would you like to use src/ directory? → No
#   Would you like to customize the import alias? → No (just press Enter)

# 2. Enter the project folder
cd gene-prioritizer

# 3. Install required packages
npm install @google/generative-ai lucide-react clsx

# 4. Install dev packages
npm install --save-dev jest @types/jest ts-jest
```

Now **copy all the files from this project** into the `gene-prioritizer` folder, replacing any that exist.
(If you downloaded this as a zip, unzip it and copy the contents in.)

```bash
# 5. Create your local environment file
cp .env.local.example .env.local
```

Open `.env.local` in VS Code (or any text editor) and paste your Gemini key:
```
GEMINI_API_KEY=AIza...your-actual-key-here...
```
Save the file.

---

### Step 1.4 — Test Locally

```bash
# Start the development server
npm run dev
```

Open your browser and go to **http://localhost:3000**

You should see the GenePrioritizer interface. Try it:
- Type: `intellectual disability, absent speech, hypotonia, seizures, small head`
- Click **Prioritize Genes**
- Wait ~15 seconds — results should appear

If it works, proceed to Step 1.5.

---

### Step 1.5 — Create a GitHub Repository

1. Go to **https://github.com** and sign in (or create a free account)
2. Click the **"+"** icon in the top-right corner → **"New repository"**
3. In the **Repository name** field type: `gene-prioritizer`
4. Leave everything else as default (public or private — your choice)
5. Click the green **"Create repository"** button
6. You'll see a page with setup instructions. Copy the URL shown (it looks like
   `https://github.com/YOURNAME/gene-prioritizer.git`)

Now back in your terminal (make sure you're in the `gene-prioritizer` folder):

```bash
git init
git add .
git commit -m "Initial commit — GenePrioritizer"
git branch -M main
git remote add origin https://github.com/YOURNAME/gene-prioritizer.git
# ↑ Replace YOURNAME with your actual GitHub username
git push -u origin main
```

GitHub will ask for your username and password.
For the password, use a **Personal Access Token** (not your GitHub password):
- Go to **https://github.com/settings/tokens**
- Click **"Generate new token (classic)"**
- Give it a name, set expiration, check the **"repo"** checkbox
- Click **"Generate token"** at the bottom
- Copy the token and use it as the password when git asks

---

### Step 1.6 — Deploy to Vercel

1. Go to **https://vercel.com** and click **"Sign Up"**
2. Choose **"Continue with GitHub"** — this links your accounts
3. Click **"Add New Project"** (or "New Project" button on the dashboard)
4. You'll see a list of your GitHub repos. Find **gene-prioritizer** and click **"Import"**
5. On the configuration page:
   - **Framework Preset**: Next.js (auto-detected ✓)
   - **Root Directory**: leave as `./ `
   - Expand **"Environment Variables"** section
   - Click **"Add"** and enter:
     - **Name**: `GEMINI_API_KEY`
     - **Value**: paste your `AIza...` key
   - Click **"Add"** again to save it
6. Click the big **"Deploy"** button
7. Wait 2–3 minutes while it builds. When you see confetti and "Congratulations!", click **"Continue to Dashboard"**
8. Your app is live! Click the URL shown (it'll be something like `gene-prioritizer-yourname.vercel.app`)

---

### Step 1.7 — Set Up Auto-Deploy

From now on, every time you push code to GitHub, Vercel automatically rebuilds and deploys:

```bash
# Make any change, then:
git add .
git commit -m "description of change"
git push origin main
# Vercel deploys automatically in ~1 minute
```

---

## ⚙️ PHASE 2 — Exomiser (Adds Variant-Level Scoring)

Exomiser requires a server to run Java. We'll use Railway — it's simpler than AWS for this use case.

### Step 2.1 — Prerequisites

- Download **Java 21**: Go to **https://adoptium.net/temurin/releases/?version=21**
  - Under "Operating System" select your OS, Architecture: x64, Package Type: JDK
  - Click the `.pkg` (Mac) or `.msi` (Windows) download button → install it
  - Verify: `java --version` in terminal should show `21.x.x`

- Download **Exomiser JAR**: Go to **https://github.com/exomiser/Exomiser/releases/latest**
  - Find and download the file named `exomiser-rest-prioritiser-XX.X.X.jar`
  - Save it to a new folder: `exomiser-service/`

### Step 2.2 — Download Exomiser Data

This is the biggest step — 5–10 GB of genome data.

```bash
mkdir exomiser-service
cd exomiser-service

# Download latest Exomiser data (this takes 30-90 minutes depending on your connection)
# Go to: https://data.monarchinitiative.org/exomiser/latest/
# Download the file: 2402_hg38.zip (or latest year version)
# Also download: 2402_phenotype.zip

# Unzip them:
unzip 2402_hg38.zip
unzip 2402_phenotype.zip
```

### Step 2.3 — Create Exomiser REST Wrapper

Create this file as `exomiser-service/server.py`:

```python
from flask import Flask, request, jsonify
import subprocess, json, tempfile, os

app = Flask(__name__)
EXOMISER_JAR = "exomiser-rest-prioritiser-14.0.0.jar"  # update version

@app.route("/api/v1/analysis", methods=["POST"])
def analyze():
    data = request.json
    hpo_ids = [f["type"]["id"] for f in data["phenopacket"]["phenotypicFeatures"]]
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump({"hpoIds": hpo_ids, "analysisMode": "PHENOTYPE_ONLY"}, f)
        input_file = f.name
    
    try:
        result = subprocess.run([
            "java", "-jar", EXOMISER_JAR,
            "--analysis", input_file,
            "--spring.config.location=application.properties"
        ], capture_output=True, text=True, timeout=120)
        
        # Parse Exomiser output JSON
        output = json.loads(result.stdout)
        return jsonify(output)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(input_file)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
```

### Step 2.4 — Deploy Exomiser on Railway

1. Go to **https://railway.com** → Sign Up with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your Exomiser service repo (create a new GitHub repo for it, push the files there)
4. In the Railway project settings:
   - Click **"Variables"** → add: `PORT=8080`
   - Click **"Settings"** → set **"Start Command"**: `python server.py`
5. Under **"Settings"** → **"Volumes"**: add a volume at `/app/data` (for the genome data)
6. Click **"Deploy"**
7. Once deployed, go to **"Settings"** → **"Networking"** → click **"Generate Domain"**
   - This gives you a URL like `exomiser-service.up.railway.app`

### Step 2.5 — Connect Exomiser to Your Vercel App

1. Go to **https://vercel.com** → your project → **Settings** → **Environment Variables**
2. Click **"Add New"**:
   - Name: `EXOMISER_API_URL`
   - Value: `https://exomiser-service.up.railway.app`
3. Click **"Save"**
4. Go to **Deployments** → click the three dots on the latest deployment → **"Redeploy"**

Exomiser scores now appear automatically in results whenever the service is reachable.

---

## 📚 PHASE 3 — Private Literature (Pinecone RAG)

This lets you upload private papers that aren't publicly available and have them influence gene ranking.

### Step 3.1 — Create a Pinecone Account

1. Go to **https://app.pinecone.io** → click **"Sign Up Free"**
2. Fill in name, email, password → click **"Create Account"**
3. Verify your email via the confirmation link Pinecone sends you
4. You'll land on the Pinecone console dashboard

### Step 3.2 — Create an Index

1. In the left sidebar, click **"Indexes"**
2. Click **"Create Index"** (top right)
3. Fill in:
   - **Index Name**: `gene-literature`
   - **Dimensions**: `768` (matches Gemini text-embedding-004 output size)
   - **Metric**: `cosine`
   - **Pod Type**: `p1.x1` (free tier)
4. Click **"Create Index"** — wait ~1 minute for it to initialize

### Step 3.3 — Get Your Pinecone API Key

1. In the left sidebar click **"API Keys"**
2. Click **"Create API Key"**
3. Name it `gene-prioritizer` → click **"Create Key"**
4. Copy the key shown (starts with `pcsk_...`)
   - ⚠️ This is shown only once — save it somewhere secure

### Step 3.4 — Add Keys to Vercel

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add these two:
   - Name: `PINECONE_API_KEY`, Value: `pcsk_...` (your key)
   - Name: `PINECONE_INDEX`, Value: `gene-literature`
3. Redeploy (same as Step 2.5 above)

### Step 3.5 — Upload Papers

Use this curl command to ingest a PDF paper (replace the file path and URL):

```bash
# Convert PDF to base64 and upload
python3 -c "
import base64, json, urllib.request

with open('your-paper.pdf', 'rb') as f:
    pdf_b64 = base64.b64encode(f.read()).decode()

data = json.dumps({'pdfBase64': pdf_b64, 'source': 'Author 2024 - Gene X Study'}).encode()
req = urllib.request.Request(
    'https://your-app.vercel.app/api/literature',
    data=data,
    headers={'Content-Type': 'application/json'},
    method='POST'
)
resp = urllib.request.urlopen(req)
print(resp.read().decode())
"
```

You'll see `{"success": true, "chunksIndexed": 12}` — the paper is now searchable.
Repeat for as many papers as you need. The free Pinecone tier holds ~2GB (~500 papers).

---

## 🔄 Adding Features Going Forward

Every new feature follows the same workflow:

```bash
# 1. Create a branch
git checkout -b feature/your-feature-name

# 2. Write code in VS Code (or any editor)

# 3. Test locally
npm run dev

# 4. Push to GitHub — Vercel builds a preview URL automatically
git add .
git commit -m "feat: describe what you added"
git push origin feature/your-feature-name

# 5. Go to GitHub → open a Pull Request → Vercel shows a preview link
# 6. Test the preview → merge to main → production auto-deploys
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| Vercel build fails | Check the build logs — usually a missing env var or TypeScript error |
| "GEMINI_API_KEY not set" | Make sure the key is in Vercel env vars AND you redeployed after adding it |
| HPO search returns no results | The HPO JAX API is public but sometimes slow — wait and retry |
| Gene results seem wrong | Check the Warnings section in results — unvalidated genes are flagged |
| Free tier rate limit (429) | Gemini free allows 15 req/min — the app auto-retries with a delay |
| Exomiser times out | Large VCF files can take >60s — upgrade to Railway Pro for longer timeouts |

---

## 📁 Project Structure Reference

```
gene-prioritizer/
├── app/
│   ├── page.tsx                    ← Main UI
│   ├── layout.tsx                  ← HTML shell
│   ├── globals.css                 ← Design system
│   └── api/
│       ├── prioritize/route.ts     ← Main orchestration (all 6 steps)
│       ├── hpo/route.ts            ← HPO search proxy
│       ├── validate-genes/route.ts ← HGNC hallucination guard
│       └── literature/route.ts     ← PDF ingestion + query
├── lib/
│   ├── gemini.ts                   ← Gemini AI (HPO extraction + prioritization)
│   ├── hpo.ts                      ← HPO JAX API client
│   ├── hgnc.ts                     ← HGNC gene validator
│   ├── exomiser.ts                 ← Exomiser REST client
│   └── literature.ts               ← Pinecone RAG client
├── types/
│   └── index.ts                    ← All TypeScript types
├── .env.local.example              ← Template for your keys
├── .github/workflows/ci.yml        ← Auto-tests on every PR
└── DEPLOYMENT.md                   ← This file
```
