const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

// ==========================================
// 🔑 ดึง GEMINI API KEY จากการตั้งค่าของเซิร์ฟเวอร์ Render (ป้องกันการโดนแบน)
// ==========================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
// ==========================================

// นำเข้าโมดูลสร้างการ์ด Flex Message ที่เราแยกไฟล์ไว้
const { getSmartFactoryFlexMessage } = require('./public/FlexDesign/flex-message');

const app = express();
const PORT = 4000;

// Middleware สำหรับจัดการ JSON และการเสิร์ฟไฟล์หน้าเว็บ
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public/Web')));

// การตั้งค่า LINE API (เอาไว้ให้ผู้ใช้มากรอกทีหลัง)
// หมายเหตุ: อย่าลืมใส่ Channel Access Token ของคุณ
const LINE_ACCESS_TOKEN = 'LwYN7y7w9mLrlQaVpXNvkwyRI3HWriFviAiY0+Ub/8GWxDBIFtkhYiuvLerflX5JkG/iD4FSbj5CNW77vhPnt2Pvpm5w3p3mQ7vQofbVmMhj5ic5vLhlmVt2zuUhQR5BmgDW8Pk212banIe5X24eTQdB04t89/1O/w1cDnyilFU='; 

// API สำหรับรับข้อความจากหน้าเว็บ แล้วส่งไปหาผู้ใช้ (Push Message)
app.post('/api/send-message', async (req, res) => {
    const { userId, message } = req.body;

    if (!userId || !message) {
        return res.status(400).json({ success: false, error: 'กรุณากรอก User ID และข้อความให้ครบถ้วน' });
    }

    if (LINE_ACCESS_TOKEN === 'YOUR_CHANNEL_ACCESS_TOKEN') {
        return res.status(400).json({ success: false, error: 'คุณยังไม่ได้ใส่ Channel Access Token ในโค้ด server.js' });
    }

    try {
        const response = await axios.post(
            'https://api.line.me/v2/bot/message/push',
            {
                to: userId,
                messages: [
                    {
                        type: 'text',
                        text: message
                    }
                ]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
                }
            }
        );

        res.json({ success: true, data: response.data });
    } catch (error) {
        console.error('Error sending message:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            success: false, 
            error: error.response ? error.response.data.message : 'ไม่สามารถส่งข้อความได้' 
        });
    }
});

// API สำหรับเช็คโควต้าข้อความที่ส่งได้
app.get('/api/quota', async (req, res) => {
    if (LINE_ACCESS_TOKEN === 'YOUR_CHANNEL_ACCESS_TOKEN') {
        return res.status(400).json({ success: false, error: 'คุณยังไม่ได้ใส่ Channel Access Token' });
    }

    try {
        // 1. ดึงข้อมูลจำนวนที่ส่งไปแล้วในเดือนนี้
        const consumptionRes = await axios.get('https://api.line.me/v2/bot/message/quota/consumption', {
            headers: { 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` }
        });
        
        // 2. ดึงข้อมูลโควต้ารวม
        const quotaRes = await axios.get('https://api.line.me/v2/bot/message/quota', {
            headers: { 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` }
        });

        res.json({ 
            success: true, 
            data: {
                totalUsage: consumptionRes.data.totalUsage,
                type: quotaRes.data.type,
                value: quotaRes.data.value
            }
        });
    } catch (error) {
        console.error('Error fetching quota:', error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, error: 'ไม่สามารถดึงข้อมูลโควต้าได้' });
    }
});

// ฟังก์ชันสำหรับอ่านและบันทึกผู้ใช้
const USERS_FILE = path.join(__dirname, 'users.json');
function getSavedUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}
function saveUser(id, type) {
    const users = getSavedUsers();
    if (!users.find(u => u.id === id)) {
        users.push({ id, type, timestamp: new Date().toISOString() });
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
}

const CHAT_FILE = path.join(__dirname, 'chat_history.json');
function getChatHistory() {
    try {
        if (!fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, '[]');
        return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}
function saveChatMessage(userId, text) {
    const chats = getChatHistory();
    // เก็บแค่ 50 ข้อความล่าสุด จะได้ไม่ล้น
    if (chats.length >= 50) chats.shift();
    chats.push({ userId, text, timestamp: new Date().toISOString() });
    fs.writeFileSync(CHAT_FILE, JSON.stringify(chats, null, 2));
}

// ระบบจัดการลงทะเบียน
const REG_FILE = path.join(__dirname, 'registrations.json');
function saveRegistration(userId, displayName) {
    try {
        let regs = [];
        if (fs.existsSync(REG_FILE)) regs = JSON.parse(fs.readFileSync(REG_FILE, 'utf8'));
        const existing = regs.find(r => r.userId === userId);
        if (!existing) {
            regs.push({ userId, displayName, timestamp: new Date().toISOString() });
            fs.writeFileSync(REG_FILE, JSON.stringify(regs, null, 2));
        }
    } catch(e) {
        console.error('Error saving registration', e);
    }
}

// ==========================================
// ฐานข้อมูล Google Sheets แจกงาน
// ==========================================
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSGWguV2X4V2C-63hpek3FmcNsBsJd4tgCbMH4oo9DhSs4TqjNpu0xLlJEttqg0e6QUkg4viTs25APi/pub?output=csv';

// ฟังก์ชันอ่านไฟล์ CSV แบบง่าย (รองรับเครื่องหมายคอมม่าในข้อความ)
function parseCSV(str) {
    const result = [];
    let row = [], inQuotes = false, val = '';
    for (let i = 0; i < str.length; i++) {
        let c = str[i], next = str[i+1];
        if (c === '"' && inQuotes && next === '"') { val += '"'; i++; }
        else if (c === '"') { inQuotes = !inQuotes; }
        else if (c === ',' && !inQuotes) { row.push(val.trim()); val = ''; }
        else if (c === '\n' && !inQuotes) { row.push(val.trim()); result.push(row); row = []; val = ''; }
        else if (c === '\r' && !inQuotes) { /* ข้าม \r */ }
        else { val += c; }
    }
    row.push(val.trim()); result.push(row);
    return result;
}

// เก็บประวัติตารางงานตอนเช้าไว้ในหน่วยความจำชั่วคราว เพื่อให้โหมดงานด่วนใช้อ้างอิงผู้ช่วย
let lastDailySchedule = "";

// API สำหรับให้ LINE ส่ง Webhook เข้ามา
app.post('/webhook', async (req, res) => {
    // ตอบกลับ LINE ทันทีว่าได้รับแล้ว (ต้องตอบ 200 ไม่งั้น LINE จะถือว่า error)
    res.status(200).send('OK');

    const events = req.body.events;
    if (events && events.length > 0) {
        for (const event of events) {
            // 1. ดักจับ ID ผู้ใช้/กลุ่ม
            const source = event.source;
            if (source) {
                if (source.type === 'user' && source.userId) {
                    saveUser(source.userId, 'User');
                } else if (source.type === 'group' && source.groupId) {
                    saveUser(source.groupId, 'Group');
                }
            }

            // 2. ตรวจสอบข้อความและตอบกลับ (Reply Message)
            if (event.type === 'message' && event.message.type === 'text') {
                const userText = event.message.text.trim();
                const replyToken = event.replyToken;
                
                // บันทึกข้อความลงไฟล์เพื่อให้หน้าเว็บดึงไปโชว์
                const senderId = (source && source.userId) ? source.userId : 'Unknown';
                saveChatMessage(senderId, userText);

                let messagesPayload = [];

                // 1. ถ้าพิมพ์ "เมนู" ให้โชว์แผงควบคุมเหมือนเดิม
                if (userText === 'เมนู' || userText === '?') {
                    messagesPayload = [getSmartFactoryFlexMessage()];
                }
                // 1.0 ดักคำสั่ง "ลงทะเบียน" เพื่อดึง LINE User ID ให้พี่ไปใส่ใน Excel
                else if (userText === 'ลงทะเบียน') {
                    const userId = (source && source.userId) ? source.userId : 'ไม่พบ ID';
                    const userName = event.source.type === 'user' ? 'แชทส่วนตัว' : 'ในกลุ่ม';
                    
                    let displayName = 'ไม่ทราบชื่อ';
                    try {
                        if (userId !== 'ไม่พบ ID') {
                            const profileRes = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
                                headers: { 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` }
                            });
                            displayName = profileRes.data.displayName;
                        }
                    } catch (err) {
                        if (source.groupId) {
                            try {
                                const groupProfileRes = await axios.get(`https://api.line.me/v2/bot/group/${source.groupId}/member/${userId}`, {
                                    headers: { 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` }
                                });
                                displayName = groupProfileRes.data.displayName;
                            } catch (e) {}
                        }
                    }

                    // บันทึกการลงทะเบียน
                    if (userId !== 'ไม่พบ ID') {
                        saveRegistration(userId, displayName);
                    }

                    messagesPayload = [{ 
                        type: 'text', 
                        text: `✅ ลงทะเบียนสำเร็จ!\n\nคุณ: ${displayName}\nรหัส ID:\n${userId}\n\n(แจ้งหัวหน้าให้นำรหัสนี้ไปใส่ใน Excel ได้เลยค่ะ)` 
                    }];
                }
                // 1.0.1 ดักคำสั่ง "Bot แจกงาน" (รองรับการที่หัวหน้าพิมพ์ @All นำหน้า)
                else if (userText.toLowerCase().includes('bot แจกงาน')) {
                    try {
                        const response = await axios.get(SHEET_CSV_URL);
                        const rows = parseCSV(response.data);
                        rows.shift(); // ตัดแถวหัวคอลัมน์ทิ้ง

                        // จัดกลุ่มงานตามชื่อพนักงาน { "ชื่อ": ["งาน1", "งาน2"] }
                        const userTasks = {};
                        for (const row of rows) {
                            // คอลัมน์ A = ชื่อ (row[0]), คอลัมน์ B = งาน (row[1])
                            let name = row[0] ? row[0].trim() : '';
                            let task = row[1] ? row[1].trim() : '';

                            // ป้องกันกรณีพี่สลับคอลัมน์ หรือยังมีคอลัมน์ U... (ID) หลงเหลืออยู่
                            if (name.startsWith('U') && name.length > 20) {
                                name = row[1] ? row[1].trim() : '';
                                task = row[2] ? row[2].trim() : '';
                            }

                            if (!name || !task) continue;
                            
                            if (!userTasks[name]) {
                                userTasks[name] = [];
                            }
                            userTasks[name].push(task);
                        }

                        let rawTasksText = "";
                        let hasTask = false;

                        // สร้างข้อความตั้งต้นแบบรวบยอด
                        for (const [name, tasks] of Object.entries(userTasks)) {
                            hasTask = true;
                            rawTasksText += `ชื่อ: ${name}\n`;
                            for (let i = 0; i < tasks.length; i++) {
                                rawTasksText += `${i + 1}. ${tasks[i]}\n`;
                            }
                            rawTasksText += `\n`;
                        }

                        if (!hasTask) {
                            messagesPayload = [{ type: 'text', text: '⚠️ วันนี้ไม่มีตารางงานในระบบค่ะ หรือตารางอาจจะว่างเปล่า' }];
                        } else {
                            // ส่งให้ AI แปลรวดเดียวจบใน 1 คำขอ (แก้ปัญหา Rate Limit การส่งถี่ยิบ)
                            const prompt = `คุณคือผู้ช่วยแปลภาษาในโรงงาน
นี่คือรายการแจกงานประจำวันของพนักงานที่หัวหน้าจัดไว้:

${rawTasksText}

หน้าที่ของคุณ:
1. แปลรายละเอียดงานแต่ละข้อให้เป็นภาษาพม่า (ใช้ภาษาพูด เข้าใจง่ายสำหรับแรงงานพม่า)
2. **ห้ามข้าม ห้ามตัด หรือลดทอนงานข้อใดข้อหนึ่งทิ้งเด็ดขาด** (ต้องแปลให้ครบทุกข้อตามที่ให้ไป)
3. **ห้ามแก้ไขข้อความภาษาไทยต้นฉบับเด็ดขาด** ให้คงข้อความภาษาไทยเดิมไว้เป๊ะๆ
4. ห้ามสลับชื่องานกับชื่อพนักงาน
5. จัดรูปแบบการตอบกลับให้เหมือนตัวอย่างด้านล่างนี้เป๊ะๆ ห้ามใช้ Markdown code block:

📋 **รายละเอียดงานประจำวัน:**

👷‍♂️ ชื่อ: [ชื่อพนักงาน]
  1. 🇹🇭 [ชื่องานภาษาไทยข้อ 1]
      🇲🇲 [คำแปลพม่าข้อ 1]
  2. 🇹🇭 [ชื่องานภาษาไทยข้อ 2]
      🇲🇲 [คำแปลพม่าข้อ 2]

(แปลและจัดรูปแบบเรียงไปจนครบทุกคนที่หัวหน้าสั่ง)`;

                            try {
                                const aiResult = await genAI.models.generateContent({
                                    model: 'gemini-3.6-flash',
                                    contents: prompt
                                });
                                
                                const finalMessage = aiResult.text.trim().replace(/```/g, '');
                                
                                // บันทึกตารางนี้เก็บไว้ให้ 'โหมดงานด่วน' อ่าน
                                lastDailySchedule = finalMessage;
                                
                                messagesPayload = [{
                                    type: 'text',
                                    text: finalMessage
                                }];
                            } catch (e) {
                                console.error('Batch Translate Error:', e);
                                messagesPayload = [{ type: 'text', text: '❌ ระบบแปลภาษาขัดข้องค่ะ' }];
                            }
                        }
                    } catch (e) {
                        console.error('แจกงาน Error:', e);
                        messagesPayload = [{ type: 'text', text: '❌ ไม่สามารถดึงข้อมูลแจกงานจาก Google Sheets ได้ค่ะ' }];
                    }
                }
                // 1.0.2 ดักคำสั่ง "Bot งานด่วน" (สำหรับงานแทรกระหว่างวัน ที่หัวหน้าเจาะจงคนมาแล้ว)
                else if (userText.toLowerCase().includes('bot งานด่วน')) {
                    // ตัดคำว่า bot งานด่วน ออก เพื่อเอาเฉพาะเนื้อหางาน
                    const urgentTaskIndex = userText.toLowerCase().indexOf('bot งานด่วน');
                    const urgentTask = userText.substring(urgentTaskIndex + 11).trim();

                    if (!urgentTask) {
                        messagesPayload = [{ type: 'text', text: '⚠️ กรุณาระบุรายละเอียดงานด่วนด้วยค่ะ เช่น "Bot งานด่วน ให้หม่องไปซ่อมท่อ"' }];
                    } else {
                        try {
                            const prompt = `คุณคือผู้ช่วยจัดรูปแบบและแปลภาษาคำสั่งงานด่วนในโรงงาน
ข้อความคำสั่งจากหัวหน้า: "${urgentTask}"

หน้าที่ของคุณ:
1. วิเคราะห์และสกัด "ชื่อพนักงาน" ที่ต้องไปทำงานนี้ ออกมาจากข้อความ (ถ้ามีหลายคนก็ให้ดึงมาทั้งหมด)
2. วิเคราะห์และสกัด "รายละเอียดงานที่ต้องทำ" ออกมาจากข้อความ
3. แปลรายละเอียดงานนั้นเป็นภาษาพม่า (ใช้ภาษาพูดที่แรงงานพม่าเข้าใจง่าย)
4. จัดรูปแบบการตอบกลับ ต้องเป๊ะตามด้านล่างนี้เท่านั้น ห้ามใช้ Markdown code block:

🚨 **ประกาศงานด่วน!**
👷‍♂️ ผู้รับผิดชอบ: [ชื่อพนักงานที่ดึงได้]
🇹🇭 งาน: [รายละเอียดงาน]
🇲🇲 [คำแปลภาษาพม่า]
`;
                            const aiResult = await genAI.models.generateContent({
                                model: 'gemini-3.6-flash',
                                contents: prompt
                            });
                            
                            const finalMessage = aiResult.text.trim().replace(/```/g, '');
                            messagesPayload = [{ type: 'text', text: finalMessage }];

                        } catch (e) {
                            console.error('Urgent Task Error:', e);
                            messagesPayload = [{ type: 'text', text: '❌ ระบบ AI ขัดข้อง ไม่สามารถแจกงานด่วนได้ค่ะ' }];
                        }
                    }
                }
                // 1.1 ปุ่มทักทาย (จากการ์ด Flex)
                else if (userText === 'สวัสดี') {
                    messagesPayload = [{ type: 'text', text: 'สวัสดีค่ะพี่! 👋😄 วันนี้มีงานอะไรให้น้องช่วยบ้างคะ? พิมพ์ "Bot" แล้วตามด้วยคำถามได้เลยนะคะ~' }];
                }
                // 1.2 ปุ่มออกจากระบบ (จากการ์ด Flex)
                else if (userText === 'ขอบคุณครับ' || userText === 'ขอบคุณ' || userText === 'ขอบคุณค่ะ') {
                    messagesPayload = [{ type: 'text', text: 'ยินดีให้บริการเสมอค่ะพี่! 🙏💕 ถ้าต้องการน้องอีกก็เรียกได้เลยนะคะ~ ไปทำงานต่อได้เล้ยยย!' }];
                }
                // 2. ถ้าพิมพ์ "โควต้า" ให้เช็คจำนวนข้อความ
                else if (userText === 'โควต้า') {
                    try {
                        const consumptionRes = await axios.get('https://api.line.me/v2/bot/message/quota/consumption', {
                            headers: { 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` }
                        });
                        const quotaRes = await axios.get('https://api.line.me/v2/bot/message/quota', {
                            headers: { 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` }
                        });
                        
                        const lineUsage = consumptionRes.data.totalUsage;
                        const lineLimit = quotaRes.data.type === 'limited' ? quotaRes.data.value : 'ไม่จำกัด';
                        
                        const quotaText = `📊 รายงานสถานะโควต้าประจำเดือน\n\n🟢 LINE ข้อความตอบกลับ (Reply): ฟรีไม่จำกัด\n🟢 LINE ข้อความส่งหา (Push): ใช้ไป ${lineUsage} / ${lineLimit} ข้อความ\n\n🧠 AI (Gemini): ฟรี 1,500 ครั้ง/วัน (ไม่จำกัดข้อความ)`;
                        messagesPayload = [{ type: 'text', text: quotaText }];
                    } catch (err) {
                        messagesPayload = [{ type: 'text', text: '❌ ไม่สามารถดึงข้อมูลโควต้าได้ กรุณาตรวจสอบ LINE Access Token ค่ะ' }];
                    }
                }
                // 3. ถ้าขึ้นต้นด้วย "Bot" หรือ "bot" ให้ส่งไปหา AI ผู้หญิงติดตลก
                else if (userText.toLowerCase().startsWith('bot')) {
                    const question = userText.substring(3).trim(); // ตัดคำว่า bot ออก

                    // 🔍 ถ้าพิมพ์คำเกี่ยวกับรูป ให้ดึงรูปล่าสุดมาวิเคราะห์
                    const q = question.toLowerCase();
                    const isDuRup = q.startsWith('ดูรูป') || q.startsWith('รูปนี้') || q.startsWith('รูปก่อน') || q.startsWith('วิเคราะห์รูป') || q.includes('รูปที่ส่ง');
                    const roomId = (source && source.groupId) ? source.groupId : (source && source.userId) ? source.userId : null;
                    const savedImage = roomId && global.lastRoomImage ? global.lastRoomImage[roomId] : null;

                    if (isDuRup && savedImage) {
                        try {
                            const now = Date.now();
                            global.aiRequestTimestamps = (global.aiRequestTimestamps || []).filter(t => now - t < 60000);
                            if (global.aiRequestTimestamps.length >= 10) {
                                messagesPayload = [{ type: 'text', text: 'ใจเย็นๆ ก่อนนะคะพี่ๆ รัวเกินไปแล้ว ขอพักแป๊บนึงนะคะ 😵‍💫' }];
                            } else {
                                global.aiRequestTimestamps.push(now);
                                const extraQuestion = question.substring(4).trim(); // ตัด "ดูรูป" ออก
                                const analysisPrompt = extraQuestion
                                    ? `คุณคือ "น้องบอท" เพศหญิง ร่าเริง ติดตลกนิดๆ วิเคราะห์รูปนี้แล้วตอบคำถามนี้: "${extraQuestion}" ตอบไม่เกิน 40 คำ ลงท้ายด้วย ค่ะ/นะคะ`
                                    : `คุณคือ "น้องบอท" เพศหญิง ร่าเริง ติดตลกนิดๆ วิเคราะห์รูปนี้ให้หน่อยนะคะ บอกว่าเห็นอะไร มีอะไรผิดปกติไหม แนะนำสั้นๆ ไม่เกิน 40 คำ ลงท้ายด้วย ค่ะ/นะคะ`;
                                const result = await genAI.models.generateContent({
                                    model: "gemini-3.6-flash",
                                    contents: [{
                                        role: "user",
                                        parts: [
                                            { inlineData: { mimeType: savedImage.mimeType, data: savedImage.data } },
                                            { text: analysisPrompt }
                                        ]
                                    }]
                                });
                                messagesPayload = [{ type: 'text', text: result.text }];
                            }
                        } catch (err) {
                            console.error("Vision (group) Error:", err);
                            messagesPayload = [{ type: 'text', text: 'ขออภัยค่ะ น้องดูรูปไม่ออกชั่วคราว ลองใหม่นะคะ 😵‍💫' }];
                        }
                    } else if (isDuRup && !savedImage) {
                        messagesPayload = [{ type: 'text', text: 'น้องหารูปไม่เจอเลยค่ะพี่! 🤔 ช่วยส่งรูปมาในห้องนี้ก่อน แล้วค่อยพิมพ์ "Bot ดูรูปนี้" นะคะ~' }];
                    } else if (question === '') {
                        messagesPayload = [{ type: 'text', text: 'เรียกชื่อน้องแล้ว มีอะไรให้ช่วยไหมคะ? 🥺' }];
                    } else {
                        // ดึงประวัติการเรียก AI แล้วลบข้อมูลที่เก่ากว่า 1 นาที (60000 ms) ทิ้งไป
                        const now = Date.now();
                        global.aiRequestTimestamps = (global.aiRequestTimestamps || []).filter(timestamp => now - timestamp < 60000);
                        
                        // ตรวจสอบว่าใน 1 นาทีที่ผ่านมา มีคนถามเกิน 10 ครั้งหรือยัง
                        if (global.aiRequestTimestamps.length >= 10) {
                            messagesPayload = [{ type: 'text', text: 'ใจเย็นๆ ก่อนนะคะพี่ๆ ถามรัวเกิน 10 คำถามใน 1 นาทีแล้ว สมองน้องบอทร้อนไปหมดแล้วค่ะ! ขอพักหายใจสักแป๊บนะคะ 😵‍💫💦' }];
                        } else {
                            try {
                                if (!GEMINI_API_KEY) {
                                    messagesPayload = [{ type: 'text', text: 'รอแป๊บนะคะ ช่างยังไม่ได้ใส่กุญแจสมอง AI ใน Render ให้หนูเลยค่ะ 🧠🗝️' }];
                                } else {
                                    // บันทึกเวลาที่เรียกใช้งานครั้งนี้
                                    global.aiRequestTimestamps.push(now);
                                    
                                    // สั่งให้ AI สวมบทบาทเป็นผู้หญิง ติดตลก และจำกัดคำตอบไม่เกิน 30 คำ
                                    const prompt = `คุณคือผู้ช่วย AI ประจำโรงงานอุตสาหกรรม ชื่อ "น้องบอท" เป็นเพศหญิง นิสัยร่าเริง กวนนิดๆ ติดตลกหน่อยๆ คุยเก่งและเป็นกันเอง คอยช่วยงานช่างและวิศวกร\n\nกฎสำคัญมากที่ต้องปฏิบัติตามเสมอ:\n1. ตอบสั้นๆ ไม่เกิน 30 คำเท่านั้น ถ้าเกินให้สรุปให้สั้นลงก่อนส่ง\n2. ห้ามแสดงโค้ดหรือตัวอย่างยาวๆ ถ้าถามเรื่องโค้ดให้บอกแนวทางสั้นๆ แทน\n3. ลงท้ายด้วย 'ค่ะ' หรือ 'นะคะ' เสมอ\n\nคำถาม: ${question}`;
                                    
                                    // ใช้ SDK ใหม่ @google/genai (v1alpha - รองรับโมเดลล่าสุด)
                                    const result = await genAI.models.generateContent({
                                        model: "gemini-3.6-flash",
                                        contents: prompt
                                    });
                                    const aiResponse = result.text;
                                    
                                    messagesPayload = [{ type: 'text', text: aiResponse }];
                                }
                            } catch (error) {
                                console.error("Gemini Error:", error);
                                messagesPayload = [{ type: 'text', text: 'ขออภัยค่ะ ตอนนี้สมอง AI ของหนูกำลังช็อตชั่วคราว 😵‍💫' }];
                            }
                        }
                    }
                }

                // ส่งข้อความตอบกลับเฉพาะเมื่อมีการสร้าง Payload ไว้
                if (messagesPayload.length > 0) {
                    try {
                        await axios.post(
                            'https://api.line.me/v2/bot/message/reply',
                            {
                                replyToken: replyToken,
                                messages: messagesPayload
                            },
                            {
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
                                }
                            }
                        );
                    } catch (error) {
                        console.error('Error replying message:', error.response ? error.response.data : error.message);
                    }
                }
            }

            // 3. 📸 รองรับการส่งรูปภาพ
            if (event.type === 'message' && event.message.type === 'image') {
                const replyToken = event.replyToken;
                const messageId = event.message.id;
                // ถือว่าเป็นกลุ่มถ้า source.type เป็น 'group' หรือ 'room'
                const isGroup = source && (source.type === 'group' || source.type === 'room');
                const isDirectChat = source && source.type === 'user';
                const roomId = isGroup
                    ? (source.groupId || source.roomId)
                    : (source && source.userId ? source.userId : null);

                try {
                    // ดาวน์โหลดรูปจาก LINE Server
                    const imageResponse = await axios.get(
                        `https://api-data.line.me/v2/bot/message/${messageId}/content`,
                        {
                            headers: { 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` },
                            responseType: 'arraybuffer'
                        }
                    );

                    // แปลงรูปเป็น Base64
                    const base64Image = Buffer.from(imageResponse.data).toString('base64');
                    const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';

                    // 💾 บันทึกรูปล่าสุดไว้ทุกห้อง (ทั้งกลุ่มและส่วนตัว)
                    if (!global.lastRoomImage) global.lastRoomImage = {};
                    global.lastRoomImage[roomId] = { data: base64Image, mimeType };

                    if (isGroup) {
                        // ✅ กลุ่ม/ห้อง: เงียบ บันทึกรูปไว้เฉยๆ ไม่ตอบ
                        // รอให้ใครพิมพ์ "Bot ดูรูปนี้" ค่อยวิเคราะห์
                        console.log(`[Image saved] roomId: ${roomId}, sourceType: ${source.type}`);
                    } else if (isDirectChat) {
                        // ✅ แชทส่วนตัว: วิเคราะห์รูปให้ทันทีเลย
                        const now = Date.now();
                        global.aiRequestTimestamps = (global.aiRequestTimestamps || []).filter(t => now - t < 60000);

                        let replyText = '';
                        if (global.aiRequestTimestamps.length >= 10) {
                            replyText = 'ใจเย็นๆ ก่อนนะคะพี่! ส่งรูปรัวเกินไปแล้ว ขอพักสมองแป๊บนึงนะคะ 😵‍💫';
                        } else if (!GEMINI_API_KEY) {
                            replyText = 'ยังไม่มีกุญแจ AI เลยค่ะพี่ ช่วยใส่ GEMINI_API_KEY ใน Render ก่อนนะคะ 🗝️';
                        } else {
                            global.aiRequestTimestamps.push(now);
                            const result = await genAI.models.generateContent({
                                model: "gemini-3.6-flash",
                                contents: [{
                                    role: "user",
                                    parts: [
                                        { inlineData: { mimeType, data: base64Image } },
                                        { text: `คุณคือ "น้องบอท" เพศหญิง ร่าเริง ติดตลกนิดๆ วิเคราะห์รูปนี้ให้หน่อยนะคะ บอกว่าเห็นอะไร มีจุดผิดปกติหรือน่ากังวลไหม แนะนำสั้นๆ ไม่เกิน 40 คำ ลงท้ายด้วย ค่ะ/นะคะ` }
                                    ]
                                }]
                            });
                            replyText = result.text;
                        }

                        // ส่งคำตอบกลับไปใน LINE
                        await axios.post(
                            'https://api.line.me/v2/bot/message/reply',
                            { replyToken, messages: [{ type: 'text', text: replyText }] },
                            { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` } }
                        );
                    } // end else if (isDirectChat)
                } catch (error) {
                    console.error('Vision AI Error:', error.message || error);
                    try {
                        await axios.post(
                            'https://api.line.me/v2/bot/message/reply',
                            { replyToken, messages: [{ type: 'text', text: 'ขออภัยค่ะ น้องมองรูปไม่เห็นชั่วคราว สมองช็อตเลยค่ะ 😵‍💫 ลองใหม่อีกทีนะคะ' }] },
                            { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` } }
                        );
                    } catch (e) {}
                }
            }
        }
    }
});

// API สำหรับดึงรายชื่อ ID ทั้งหมดไปโชว์ที่หน้าเว็บ
app.get('/api/users', (req, res) => {
    res.json({ success: true, data: getSavedUsers() });
});

// API สำหรับดึงรายชื่อคนลงทะเบียน
app.get('/api/registrations', (req, res) => {
    try {
        if (!fs.existsSync(REG_FILE)) fs.writeFileSync(REG_FILE, '[]');
        res.json({ success: true, data: JSON.parse(fs.readFileSync(REG_FILE, 'utf8')) });
    } catch(e) {
        res.json({ success: false, error: e.message, data: [] });
    }
});

// API สำหรับดึงประวัติข้อความแชท
app.get('/api/messages', (req, res) => {
    res.json({ success: true, data: getChatHistory() });
});

// API สำหรับเช็ครุ่นของ AI (ใช้แก้ปัญหา 404)
app.get('/api/models', async (req, res) => {
    try {
        const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        res.json({ success: true, models: response.data.models.map(m => m.name) });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 LINE Bot Dashboard เปิดทำงานแล้วที่ http://localhost:${PORT}`);
});
