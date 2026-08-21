// ฟังก์ชันสำหรับส่งกลับโครงสร้าง Flex Message แบบ Dark Mode Premium
function getSmartFactoryFlexMessage() {
    return {
        type: "flex",
        altText: "เมนูทางลัด",
        contents: {
            type: "bubble",
            size: "mega",
            hero: {
                type: "image",
                url: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
                size: "full",
                aspectRatio: "20:13",
                aspectMode: "cover"
            },
            body: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#1A1C23",
                paddingAll: "25px",
                contents: [
                    {
                        type: "text",
                        text: "⚡ SYSTEM CONTROL",
                        weight: "bold",
                        color: "#00E676",
                        size: "sm"
                    },
                    {
                        type: "text",
                        text: "SMART FACTORY",
                        weight: "bold",
                        size: "xxl",
                        color: "#FFFFFF",
                        margin: "md"
                    },
                    {
                        type: "separator",
                        margin: "xl",
                        color: "#333333"
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        margin: "xl",
                        spacing: "sm",
                        contents: [
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    { type: "text", text: "STATUS", color: "#888888", size: "sm", flex: 0 },
                                    { type: "text", text: "ONLINE", color: "#00E676", size: "sm", align: "end", weight: "bold" }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    { type: "text", text: "NETWORK", color: "#888888", size: "sm", flex: 0 },
                                    { type: "text", text: "SECURE", color: "#00B0FF", size: "sm", align: "end", weight: "bold" }
                                ]
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#1A1C23",
                spacing: "sm",
                paddingAll: "25px",
                paddingTop: "10px",
                contents: [
                    {
                        type: "button",
                        style: "primary",
                        color: "#00A040", // สีเขียวเข้มเพื่อให้ตัวหนังสือสีขาวอ่านง่าย
                        height: "sm",
                        action: { type: "message", label: "👋 ทักทายระบบ", text: "สวัสดี" }
                    },
                    {
                        type: "button",
                        style: "primary",
                        color: "#3A3F50",
                        height: "sm",
                        action: { type: "message", label: "🙏 ออกจากระบบ", text: "ขอบคุณครับ" }
                    }
                ]
            }
        }
    };
}

// ส่งออกฟังก์ชันเพื่อให้ไฟล์อื่น (server.js) เรียกใช้ได้
module.exports = { getSmartFactoryFlexMessage };
