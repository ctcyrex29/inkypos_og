# InkyPOS Deployment Guide - Week of Nov 2-7

**Status:** ✅ Build Complete | Ready to Deploy

---

## 🚀 TODAY: Deploy to Vercel (5 minutes)

### Option 1: Vercel Web Dashboard (Easiest)

1. Go to [vercel.com](https://vercel.com)
2. Sign in with GitHub
3. Click "New Project"
4. Select your `inkypos_og` repository
5. Framework: **Vite**
6. Build Command: `npm run build`
7. Output Directory: `dist`
8. Environment Variables:
   ```
   VITE_SUPABASE_URL = https://luuvozzqimlfnofoomem.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1dXZvenpxaW1sZm5vZm9vbWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MTg2ODYsImV4cCI6MjEwOTE5NDY4Nn0.PGTN552zp4f3TIqDI39D9gRFNVzQ8Wdlet-CCWXwwf0
   ```
9. Click "Deploy"
10. **Wait 2-3 minutes for deployment**
11. You'll get a URL like: `https://inkypos-xxx.vercel.app`

✅ **YOUR WEB APP IS LIVE!**

---

### Option 2: Vercel CLI (If you prefer terminal)

```bash
npm install -g vercel
cd apps/web
vercel --prod --build-command "npm run build" --output-directory "dist"
# Follow prompts, add environment variables
```

---

## 🔑 Generate Play Store Signing Key

**You need Java installed first:**

### On Windows:
```bash
# Download Java if not installed
# https://www.oracle.com/java/technologies/downloads/

# Then run this command (replace C:\path\to\jdk with your Java path)
"C:\Program Files\Java\jdk-17\bin\keytool" -genkey -v -keystore inkypos-release.jks ^
  -keyalg RSA -keysize 2048 -validity 10000 -alias inkypos-key ^
  -storepass "InkyPOS@2024" -keypass "InkyPOS@2024" ^
  -dname "CN=InkyPOS,O=Inkgenius,OU=Engineering,L=Global,ST=Global,C=US"
```

### On Mac/Linux:
```bash
keytool -genkey -v -keystore inkypos-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias inkypos-key \
  -storepass "InkyPOS@2024" -keypass "InkyPOS@2024" \
  -dname "CN=InkyPOS,O=Inkgenius,OU=Engineering,L=Global,ST=Global,C=US"
```

**This creates:** `inkypos-release.jks` (keep it safe! 🔐)

---

## 📱 Build Android App

### 1. Install Bubblewrap
```bash
npm install -g @bubblewrap/cli
```

### 2. Update twa-manifest.json
```json
{
  "host": "your-vercel-domain.vercel.app",
  "launchUrl": "https://your-vercel-domain.vercel.app",
  "manifestUrl": "https://your-vercel-domain.vercel.app/manifest.json",
  "iconUrl": "https://your-vercel-domain.vercel.app/icon-512.png"
}
```

### 3. Build Android App
```bash
cd ~/projects/inkypos_og
bubblewrap build --release
```

Creates: `app-release.aab` (upload to Play Store)

---

## 📤 Submit to Play Store

### 1. Go to Play Console
https://play.google.com/console

### 2. Create New App
- Name: `InkyPOS`
- Category: Business
- Free: Yes

### 3. Upload Release Bundle
- Go to Release → Production
- Upload `app-release.aab`

### 4. Complete Listing
Fill in:
- Description
- Screenshots (take 4-8 screenshots from your Vercel URL)
- Feature graphic (1024×500 PNG)
- App icon (512×512 PNG)
- Privacy policy URL (add to your web app)

### 5. Submit for Review
Click "Submit for review"

**Review time: 24-48 hours**

---

## ✅ Verification Checklist

### Web App (After Vercel Deploy)
- [ ] Open Vercel URL in browser
- [ ] Login works
- [ ] Dark mode toggle works
- [ ] All pages load
- [ ] Light/dark mode persists
- [ ] Works on mobile browser

### Android App (After Build)
- [ ] APK built successfully
- [ ] AAB bundle created
- [ ] File size reasonable (< 50MB)

### Play Store (After Submit)
- [ ] App appears in console
- [ ] Submitted for review
- [ ] Check status daily

---

## 🎯 Timeline

| Time | Task | Status |
|------|------|--------|
| **TODAY** | Deploy to Vercel | ✅ Ready |
| **Tomorrow** | Generate signing key | ⏳ Pending |
| **Wed** | Build Android app | ⏳ Pending |
| **Thu** | Submit to Play Store | ⏳ Pending |
| **Fri** | Review complete + Launch | ⏳ Pending |

---

## 🔐 Keys & Passwords

**Keep these SAFE:**
```
Supabase Project: luuvozzqimlfnofoomem
Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Signing Key Password: InkyPOS@2024
Play Store Email: ctcyrex29@gmail.com
```

---

## 📞 Support

### If Vercel Deploy Fails
- Check environment variables are set
- Check build output in Vercel dashboard
- Verify `manifest.json` and `service-worker.js` exist

### If Android Build Fails
- Verify Java is installed: `java -version`
- Verify keytool path is correct
- Check twa-manifest.json has correct URLs

### If Play Store Submit Fails
- Verify AAB file is signed
- Check app description > 80 characters
- Add privacy policy URL
- Provide at least 2 screenshots

---

## 🎉 What Happens Next

**After Play Store Review (24-48 hours):**
1. App appears on Play Store
2. Anyone can download for free
3. You can announce launch! 🚀
4. Users can install from Play Store
5. Web app runs at `https://your-vercel-domain.vercel.app`

---

## 📊 Your App Info

| Item | Value |
|------|-------|
| **Package Name** | com.inkypos.app |
| **App Name** | InkyPOS |
| **Version** | 1.0.0 |
| **Supabase Project** | luuvozzqimlfnofoomem |
| **Web URL** | TBD (from Vercel) |
| **Play Store Email** | ctcyrex29@gmail.com |

---

**Let me know when Vercel deployment is complete and I'll help with the next step!** 🚀
