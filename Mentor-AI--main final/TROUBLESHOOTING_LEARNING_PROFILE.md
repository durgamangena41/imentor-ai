# 🔧 Troubleshooting: Blank Learning Profile Page

## Issue: Page shows blank/dark screen at `/learning-profile`

### ✅ **Fixes Applied:**

1. **Enhanced Error Handling** - Component now shows empty state instead of blank page
2. **Better Logging** - Console logs added to track API calls
3. **Fallback Data** - Empty data structure set on API failure

### 🔍 **How to Diagnose:**

#### **Step 1: Check Browser Console**
1. Press **F12** to open Developer Tools
2. Go to **Console** tab
3. Refresh the page
4. Look for these messages:
   - ✅ `"Knowledge state loaded:"` - API call succeeded
   - ❌ `"Failed to load knowledge state:"` - API call failed
   - ❌ `"Error details:"` - Shows the actual error

#### **Step 2: Check Network Tab**
1. In Developer Tools, go to **Network** tab
2. Refresh the page
3. Look for a request to `/api/knowledge-state`
4. Click on it to see:
   - **Status Code:**
     - `200` = Success ✅
     - `401` = Not authenticated ❌
     - `404` = Route not found ❌
     - `500` = Server error ❌
   - **Response:** Shows the actual error message

#### **Step 3: Check if Server is Running**
```bash
# Check if server is running on port 5001
curl http://localhost:5001/api/network/ip
```

If this fails, start the server:
```bash
cd server
npm start
```

### 🐛 **Common Issues & Solutions:**

#### **Issue 1: 401 Unauthorized**
**Symptom:** Network tab shows 401 status
**Cause:** Not logged in or token expired
**Solution:**
1. Log out and log back in
2. Check that `authToken` exists in Local Storage (F12 > Application > Local Storage)

#### **Issue 2: 404 Not Found**
**Symptom:** Network tab shows 404 status
**Cause:** Route not registered in server
**Solution:**
1. Check that `server/server.js` has this line:
   ```javascript
   app.use('/api/knowledge-state', authMiddleware, knowledgeStateRoutes);
   ```
2. Restart the server

#### **Issue 3: 500 Server Error**
**Symptom:** Network tab shows 500 status
**Cause:** Server-side error (likely MongoDB)
**Solution:**
1. Check server console for error messages
2. Ensure MongoDB is running
3. Check server logs for stack trace

#### **Issue 4: CORS Error**
**Symptom:** Console shows CORS error
**Cause:** Frontend and backend on different ports
**Solution:**
1. Check `frontend/.env` has correct API URL:
   ```
   VITE_API_BASE_URL=http://localhost:5001/api
   ```
2. Restart frontend dev server

#### **Issue 5: Component Not Rendering**
**Symptom:** Page is completely blank, no loading spinner
**Cause:** JavaScript error in component
**Solution:**
1. Check console for React errors
2. Look for red error messages
3. Check that all imports are correct

### 🧪 **Test the API Directly:**

#### **Option 1: Using Browser DevTools**
1. Open DevTools Console (F12)
2. Paste this code:
```javascript
fetch('http://localhost:5001/api/knowledge-state', {
    headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    }
})
.then(r => r.json())
.then(data => console.log('API Response:', data))
.catch(err => console.error('API Error:', err));
```

#### **Option 2: Using cURL**
```bash
# Replace YOUR_TOKEN with actual token from localStorage
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5001/api/knowledge-state
```

### 📊 **Expected Behavior:**

**When API succeeds:**
- Loading spinner shows for ~1-2 seconds
- Page renders with stats and profile data
- Console shows: `"Knowledge state loaded:"`

**When API fails:**
- Loading spinner shows for ~1-2 seconds
- Page shows empty state with message: "No Learning Data Yet"
- Toast notification shows error
- Console shows error details

**When not authenticated:**
- Should redirect to login page
- Or show 401 error in console

### 🔧 **Quick Fixes:**

#### **Fix 1: Clear Cache and Reload**
```
Ctrl + Shift + R (Windows)
Cmd + Shift + R (Mac)
```

#### **Fix 2: Check Frontend is Running**
```bash
cd frontend
npm run dev
```

#### **Fix 3: Restart Both Servers**
```bash
# Terminal 1 - Backend
cd server
npm start

# Terminal 2 - Frontend
cd frontend
npm run dev
```

#### **Fix 4: Check MongoDB is Running**
```bash
# Windows
net start MongoDB

# Or check if it's running
tasklist | findstr mongod
```

### 📝 **What Should You See:**

**Successful Load:**
```
Console:
✅ Knowledge state loaded: { summary: {...}, concepts: [...], ... }

Page:
- Stats cards showing: Total Topics, Mastered, Learning, Struggling
- Tabs: Overview, Topics & Mastery, Learning Insights, Session History
- Learning profile information
- Export and Reset buttons
```

**Empty State (No Data Yet):**
```
Console:
✅ Knowledge state loaded: { summary: { totalConcepts: 0, ... }, concepts: [], ... }

Page:
- Stats cards showing all zeros
- Empty messages like "No concepts mastered yet"
- "No specific focus areas identified yet"
```

**Error State:**
```
Console:
❌ Failed to load knowledge state: Error: Request failed with status code 401
❌ Error details: { message: "Unauthorized" }

Page:
- Brain icon
- "No Learning Data Yet"
- "Start chatting with the AI tutor to build your learning profile!"
Toast:
- Red error notification with error message
```

### 🎯 **Next Steps:**

1. **Open browser DevTools (F12)**
2. **Check Console tab** for error messages
3. **Check Network tab** for failed requests
4. **Report back with:**
   - What you see in the console
   - HTTP status code from Network tab
   - Any error messages

This will help identify the exact issue!
