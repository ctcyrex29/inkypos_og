# InkyPOS Play Store Build & Deployment Guide

## 📱 App Package Info
- **Package Name:** `com.inkypos.app`
- **App Name:** InkyPOS
- **Version Code:** 1
- **Version Name:** 1.0.0
- **Min SDK:** 24 (Android 7.0)
- **Target SDK:** 34 (Android 14)

---

## 🔑 Step 1: Generate Signing Key

Run this command to create a signing key for Play Store:

```bash
keytool -genkey -v -keystore inkypos-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias inkypos-key
```

**When prompted, enter:**
- Keystore password: `[create secure password]`
- Key password: `[same as above]`
- Common Name (CN): InkyPOS
- Organization (O): Your Company Name
- Organization Unit (OU): Engineering
- City (L): Your City
- State (ST): Your State
- Country Code (C): Your Country Code (e.g., US)

**Keep `inkypos-release.jks` SAFE!** 🔐 This is your app signing key. Without it, you cannot update the app on Play Store.

Store it in: `~/.android/inkypos-release.jks`

---

## 📦 Step 2: Setup Bubblewrap (Web-to-Android)

Bubblewrap is the easiest way to wrap your web app as an Android app.

### Install Bubblewrap
```bash
npm install -g @bubblewrap/cli
```

### Initialize Project
```bash
cd ~/projects/inkypos_og
bubblewrap init --packageId=com.inkypos.app \
  --appName="InkyPOS" \
  --appVersion="1.0.0" \
  --manifest="/path/to/manifest.json" \
  --keystore="/path/to/inkypos-release.jks" \
  --keystoreAlias="inkypos-key"
```

This creates `twa-manifest.json` configuration.

---

## 🏗️ Step 3: Build the App

### Build Debug APK (for testing)
```bash
bubblewrap build
```

This creates `app-debug.apk` in `android/` folder.

### Build Release Bundle (for Play Store)
```bash
bubblewrap build --release
```

This creates `app-release.aab` (Android App Bundle) - **this is what you upload to Play Store**.

---

## 🧪 Step 4: Test on Android Device

### Install Debug APK
```bash
adb install -r android/app-debug.apk
```

Test on actual device:
- [ ] App launches
- [ ] Login works
- [ ] Light/Dark mode toggle works
- [ ] All pages load
- [ ] Network requests work
- [ ] Offline mode functions (Service Worker)

---

## 📤 Step 5: Upload to Play Store

### In Google Play Console:

1. **Create App**
   - Go to [play.google.com/console](https://play.google.com/console)
   - Click "Create app"
   - Name: `InkyPOS`
   - Default language: English
   - App or game: `App`

2. **Setup App Details**
   - Category: Business
   - Content rating: Fill questionnaire
   - Target audience: 18+
   - Privacy policy: [your URL]

3. **Upload Release Bundle**
   - Go to Release → Production
   - Upload `app-release.aab` file
   - Review details:
     - Version code: 1
     - Release name: `1.0.0`

4. **Complete Store Listing**
   - App title: `InkyPOS`
   - Short description: `Modern POS system for retail and restaurants`
   - Full description: [detailed description]
   - Screenshots: 2-8 screenshots (phone & tablet)
   - Feature graphic: 1024×500 PNG
   - Icon: 512×512 PNG

5. **Content Rating**
   - Complete the questionnaire
   - Get rating certificate

6. **Pricing & Distribution**
   - Price: Free
   - Countries: Select all
   - Device categories: Phone, Tablet

7. **Review & Publish**
   - Review all details
   - Click "Submit for review"

---

## 📊 Play Store Review Timeline

- **Submission:** Usually reviewed within 24-48 hours
- **Common rejection reasons:**
  - App crashes on startup
  - Login doesn't work
  - Unclear functionality
  - Missing privacy policy
- **If rejected:** Fix issues and resubmit

---

## 🔄 Version Updates

For future versions:

```bash
# Update version in twa-manifest.json
{
  "version": "1.1.0",
  "versionCode": 2
}

# Build and upload new bundle
bubblewrap build --release
# Upload new app-release.aab to Play Store
```

---

## 📱 Web Deployment (Before Play Store)

Deploy web version first to verify everything works:

### Option 1: Vercel (Recommended)
```bash
npm install -g vercel
cd apps/web
vercel --prod
```

### Option 2: Netlify
```bash
npm install -g netlify-cli
cd apps/web
netlify deploy --prod
```

Get your production URL and update:
- `twa-manifest.json` → `startUrl`
- `manifest.json` → `start_url`

---

## 🚨 Checklist Before Submit

- [ ] Web app deployed and tested
- [ ] Service worker working (offline functionality)
- [ ] PWA manifest.json configured
- [ ] Signing key generated and backed up
- [ ] App icon (192×192, 512×512) created
- [ ] Screenshots taken (4-8 images)
- [ ] Feature graphic (1024×500) created
- [ ] Privacy policy URL ready
- [ ] App description written
- [ ] Debug APK tested on real device
- [ ] Release AAB bundle built
- [ ] Play Store listing complete
- [ ] Google Play account set up and verified

---

## 🔐 Security Checklist

- [ ] `.env` files are NOT in git
- [ ] API keys in environment variables only
- [ ] HTTPS enforced
- [ ] Service worker caches only necessary files
- [ ] No sensitive data in localStorage
- [ ] Auth tokens use HTTP-only cookies (if possible)

---

## 📞 Post-Launch Monitoring

After launch:
1. Monitor crash reports in Play Console
2. Check user reviews for issues
3. Monitor backend logs for errors
4. Set up alerts for failed API calls

---

## 🆘 Troubleshooting

### App crashes on startup
- Check web app loads in browser
- Check all APIs are CORS-enabled
- Check environment variables in .env

### Login fails
- Verify Supabase Auth is configured
- Check API keys are correct
- Verify redirect URLs match

### Service Worker not caching
- Check browser console for SW errors
- Verify public/service-worker.js exists
- Check manifest.json is valid

---

## 📚 Resources

- [Bubblewrap Documentation](https://github.com/GoogleChromeLabs/bubblewrap)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Web App Manifest Spec](https://www.w3.org/TR/appmanifest/)
- [Android App Bundle Guide](https://developer.android.com/guide/app-bundle)
