/* ==================================================
 * ไฟล์ JavaScript สำหรับจัดการการทำงานของหน้าเว็บ
 * ================================================== */

// โหลดโควต้าและดึงแชทแบบ Real-time ทันทีที่เปิดเว็บ
window.onload = () => {
    fetchQuota();
    fetchUsers();
    fetchChats();
    setInterval(fetchChats, 3000); // ดึงข้อความใหม่ทุกๆ 3 วินาที
};

// ฟังก์ชันดึงโควต้าข้อความฟรีที่เหลือ
async function fetchQuota() {
    const quotaBox = document.getElementById('quotaBox');
    try {
        const response = await fetch('/api/quota');
        const result = await response.json();
        
        if (result.success) {
            const { totalUsage, value, type } = result.data;
            const limitText = type === 'limited' ? value : 'ไม่จำกัด';
            quotaBox.innerHTML = `📊 ข้อความฟรีที่ส่งไปเดือนนี้: <span style="font-size: 18px; color: #d32f2f;">${totalUsage}</span> / ${limitText} ข้อความ`;
        } else {
            quotaBox.innerHTML = `❌ ไม่สามารถดึงโควต้าได้: ${result.error}`;
            quotaBox.style.backgroundColor = '#ffebee';
            quotaBox.style.color = '#c62828';
        }
    } catch (error) {
        quotaBox.innerHTML = '❌ การเชื่อมต่อล้มเหลว';
    }
}

// ฟังก์ชันดึงรายชื่อผู้ใช้ที่ทักมาหาบอท
async function fetchUsers() {
    const container = document.getElementById('usersContainer');
    try {
        const response = await fetch('/api/users');
        const result = await response.json();
        
        if (result.success && result.data.length > 0) {
            container.innerHTML = '';
            result.data.forEach(u => {
                const typeClass = u.type === 'User' ? 'user' : 'group';
                const time = new Date(u.timestamp).toLocaleTimeString('th-TH');
                
                const div = document.createElement('div');
                div.className = 'user-item';
                div.innerHTML = `
                    <div>
                        <span class="badge ${typeClass}">${u.type}</span>
                        <span style="color: #666;">${u.id.substring(0, 10)}...</span>
                        <div style="font-size: 10px; color: #aaa;">ดักได้ตอน: ${time}</div>
                    </div>
                    <button class="use-btn" onclick="useThisId('${u.id}')">🎯 นำไปใช้</button>
                `;
                container.appendChild(div);
            });
        } else {
            container.innerHTML = '<div style="text-align: center; color: #777; font-size: 13px;">ยังไม่มีข้อมูล</div>';
        }
    } catch (error) {
        console.error('Error fetching users');
    }
}

// ฟังก์ชันดึงข้อความแชท (Live Chat)
async function fetchChats() {
    const container = document.getElementById('chatContainer');
    try {
        const response = await fetch('/api/messages');
        const result = await response.json();
        
        if (result.success && result.data.length > 0) {
            container.innerHTML = '';
            // เอาข้อความใหม่สุดไว้ล่างสุด
            result.data.forEach(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString('th-TH');
                const div = document.createElement('div');
                div.style.marginBottom = '8px';
                div.style.padding = '8px';
                div.style.background = 'white';
                div.style.borderRadius = '6px';
                div.style.borderLeft = '3px solid #00B900';
                div.style.fontSize = '13px';
                
                div.innerHTML = `
                    <div style="color: #666; font-size: 10px; margin-bottom: 3px;">
                        ${msg.userId.substring(0,8)}... <span style="float: right;">${time}</span>
                    </div>
                    <div style="color: #333; font-weight: bold;">${msg.text}</div>
                `;
                container.appendChild(div);
            });
            // เลื่อนกล่องข้อความลงล่างสุดอัตโนมัติ
            container.scrollTop = container.scrollHeight;
        }
    } catch (error) {
        console.error('Error fetching chats');
    }
}

// ฟังก์ชันสำหรับกดปุ่ม "นำไปใช้" เพื่อคัดลอก ID ลงในช่องกรอกเป้าหมาย
function useThisId(id) {
    document.getElementById('userId').value = id;
    document.getElementById('message').focus(); // ย้ายเคอร์เซอร์ไปที่กล่องพิมพ์ข้อความ
}

// ฟังก์ชันส่งข้อความผ่านบอท (Push Message)
async function sendMessage() {
    const userId = document.getElementById('userId').value.trim();
    const message = document.getElementById('message').value.trim();
    const sendBtn = document.getElementById('sendBtn');
    const statusBox = document.getElementById('statusBox');

    if (!userId || !message) {
        showStatus('กรุณากรอกข้อมูลให้ครบถ้วน', false);
        return;
    }

    // ปิดปุ่มชั่วคราวระหว่างรอส่ง
    sendBtn.disabled = true;
    sendBtn.innerText = "กำลังส่ง...";
    statusBox.style.display = "none";

    try {
        const response = await fetch('/api/send-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId, message })
        });

        const result = await response.json();

        if (result.success) {
            showStatus('✅ ส่งข้อความสำเร็จ!', true);
            document.getElementById('message').value = ''; // เคลียร์ข้อความ
            fetchQuota(); // อัปเดตโควต้าใหม่หลังจากส่งเสร็จ
        } else {
            showStatus('❌ ผิดพลาด: ' + result.error, false);
        }
    } catch (error) {
        showStatus('❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', false);
    } finally {
        // เปิดปุ่มกลับมาให้ใช้งานได้อีกครั้ง
        sendBtn.disabled = false;
        sendBtn.innerText = "🚀 ส่งข้อความผ่านบอท";
    }
}

// ฟังก์ชันสำหรับแสดงข้อความแจ้งสถานะใต้ปุ่ม
function showStatus(text, isSuccess) {
    const statusBox = document.getElementById('statusBox');
    statusBox.innerText = text;
    statusBox.className = 'status-message ' + (isSuccess ? 'success' : 'error');
    statusBox.style.display = 'block';
}
