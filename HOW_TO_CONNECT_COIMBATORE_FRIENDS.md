# 🌐 Velora - 5 Friends Long-Distance Access Guide (Dindigul ⟷ Coimbatore)

## 📌 Problem & Solution Summary (தமிழ் & English)

* **Problem**: நீங்க Dindigul-ல இருக்கீங்க, உங்க Friend Coimbatore (Covai)-ல இருக்கான். ஒரே Wi-Fi அல்லது Mobile Hotspot share பண்ண முடியாது. Local IP (`192.168.x.x`) வேலை செய்யாது.
* **Solution**: 
  1. **Method 1 (Instant Live Tunnel)**: உங்க PC-ல `start-velora-online.bat` run பண்ணா, Worldwide Public HTTPS Link கிடைக்கும் (`https://xxxx.a.pinggy.link`). இந்த லிங்க்-ஐ Covai friend-க்கு WhatsApp-ல அனுப்புங்க.
  2. **Method 2 (24/7 Free Cloud)**: உங்க GitHub Repo-வை Render.com-ல 1-Click Deploy பண்ணா, உங்க PC Off-ல இருந்தாலும் 24 மணி நேரமும் Covai friend access பண்ணலாம்.
  3. **5 Friends Concurrent Logins**: ஒரே Email ID & Password-ல **5 Friends ஒரே நேரத்துல login** பண்ணலாம். ஒருத்தர் logout பண்ணா மத்த 4 பேரோட session logout ஆகாது!

---

## 🚀 Method 1: Instant Worldwide Link (Double-Click Run)

### Computer A (உங்க PC - Dindigul):
1. உங்க கம்ப்யூட்டர்ல **`start-velora-online.bat`** file-ஐ double-click பண்ணுங்க.
2. அது Velora server-ஐ start பண்ணிட்டு, Worldwide HTTPS Tunnel link தரும்:
   ```
   ===============================================================================
   SHARE THE HTTPS URL SHOWN BELOW WITH UP TO 5 FRIENDS IN COIMBATORE:
   https://xxxx.a.pinggy.link
   ===============================================================================
   ```
3. அந்த `https://xxxx.a.pinggy.link` லிங்க்-ஐ copy பண்ணி உங்க Coimbatore friend-க்கு அனுப்புங்க.

### Computer B / Mobile (உங்க Friend - Coimbatore):
1. உங்க Friend அந்த HTTPS லிங்க்-ஐ Browser-ல open பண்ணுவான்.
2. Sign In page-ல உங்க **Email ID** மற்றும் **Password** type பண்ணி **Sign In** பண்ணுவான்.
   *(Password பக்கத்துல இருக்க கண் ஐகான் 👁️ click பண்ணி password-ஐ check பண்ணிக்கலாம்).*
3. நீங்க Dindigul-ல upload பண்ண Movie, Videos, Files எல்லாமே உடனே அங்க காட்டும்!
4. Direct Stream (Play), Download எல்லாமே smooth-ஆ பண்ண முடியும்.
5. இதே மாதிரி **மொத்தம் 5 friends** ஒரே ID-ல login பண்ணி ஒரே நேரத்துல access பண்ணலாம்!

---

## ☁️ Method 2: 24/7 Permanent Cloud URL (Render.com)

உங்க PC off-ஆ இருந்தாலும் உங்க friend-க்கு 24/7 file access வேணும்னா:

1. [https://render.com](https://render.com)-க்கு போங்க (Free Account).
2. **New +** -> **Web Service** click பண்ணுங்க.
3. உங்க GitHub Repository: `https://github.com/Bharath-0018/Offline-Access-Files-Website` select பண்ணுங்க.
4. Settings:
   - **Environment**: Node
   - **Build Command**: *(leave empty)*
   - **Start Command**: `node server.js`
   - **Instance Type**: Free
5. **Create Web Service** click பண்ணுங்க!
6. உங்களுக்கு `https://velora-cloud.onrender.com` ங்கிற permanent 24/7 HTTPS URL கிடைக்கும்.
7. இந்த ஒரு லிங்க் போதும்! நீங்களும் உங்க 5 friends-ம் உலகத்துல எந்த மூலையில இருந்தாலும் எப்போ வேணும்னாலும் Login பண்ணி Files access பண்ணலாம்!

---

## 🔒 Security & Feature Rules Verified

1. **Strict Verification**:
   - தப்பான Email போட்டா: `No account found with this email. Please sign up first.`
   - தப்பான Password போட்டா: `Incorrect password. Please try again.`
2. **Show / Hide Password (👁️)**:
   - Password type பண்ணும்போது Eye icon click பண்ணா password visible ஆகும்.
3. **5-Friend Multi-Session Support**:
   - ஒரே Email-க்கு 5 active sessions allowed.
   - Friend 1 logout பண்ணா Friend 2, 3, 4, 5 logout ஆகாது.
4. **Permanent File Storage**:
   - Signout பண்ணாலும், browser close பண்ணாலும் Files அழியாது.
   - User explicit-ஆ "Delete" button click பண்ணா மட்டுமே file delete ஆகும்.
