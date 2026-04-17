const TOKEN = '8558263047:AAG5WGFNjnKFOtiLrFAjoT_Sbc9kx-MTUXk';
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// Regex لاستخراج البيانات
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:(?:\+|00)\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}/g;
const LINK_REGEX = /href=["'](https?:\/\/[^"']+|\/[^"']*)["']/g;

export default {
  async fetch(request, env, ctx) {
    // تيليجرام بيبعت POST requests فقط
    if (request.method !== 'POST') {
      return new Response('Worker is running!', { status: 200 });
    }

    try {
      const update = await request.json();
      if (!update.message || !update.message.text) {
        return new Response('OK', { status: 200 });
      }

      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (text === '/start') {
        await sendMessage(chatId, "أهلاً بك. أرسل رابط أو مجموعة روابط. يعمل الآن عبر Cloudflare Workers ⚡️");
        return new Response('OK', { status: 200 });
      }

      const urls = text.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));

      if (urls.length > 0) {
        // نبعت رسالة للمستخدم إننا بدأنا
        await sendMessage(chatId, `تم استلام ${urls.length} موقع. جاري الفحص في الخلفية...`);
        
        // نشغل الفحص في الخلفية عشان نرد على تيليجرام فوراً (لمنع الـ Retry)
        ctx.waitUntil(processUrls(chatId, urls));
      }

      // الرد الفوري على تيليجرام بـ 200 OK
      return new Response('OK', { status: 200 });

    } catch (e) {
      return new Response('Error', { status: 500 });
    }
  }
};

// دالة إرسال رسالة نصية
async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}

// دالة إرسال ملف
async function sendDocument(chatId, content, filename, caption) {
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption);
  
  // تحويل النص إلى ملف كبلوب (Blob) لإرساله
  const blob = new Blob([content], { type: 'text/plain' });
  formData.append('document', blob, filename);

  await fetch(`${TELEGRAM_API}/sendDocument`, {
    method: 'POST',
    body: formData
  });
}

// الفحص العميق (معدل للعمل داخل قيود Cloudflare)
async function processUrls(chatId, urls) {
  const allEmails = new Set();
  const allPhones = new Set();

  for (const startUrl of urls) {
    const visited = new Set();
    const queue = [startUrl];
    const domain = new URL(startUrl).hostname;
    
    // حددنا الصفحات بـ 5 لكل موقع عشان نلحق نخلص قبل الـ Timeout
    let pagesChecked = 0; 

    while (queue.length > 0 && pagesChecked < 5) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);
      pagesChecked++;

      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        if (!response.ok) continue;
        
        const html = await response.text();

        // استخراج الإيميلات
        const emails = html.match(EMAIL_REGEX) || [];
        emails.forEach(e => allEmails.add(e));

        // استخراج الهواتف
        const phones = html.match(PHONE_REGEX) || [];
        phones.forEach(p => allPhones.add(p));

        // استخراج الروابط للعمق
        let match;
        while ((match = LINK_REGEX.exec(html)) !== null) {
          try {
            const fullUrl = new URL(match[1], url).href;
            if (new URL(fullUrl).hostname === domain && !visited.has(fullUrl)) {
              queue.push(fullUrl);
            }
          } catch (err) {} 
        }
      } catch (err) {
        // تخطي الأخطاء بصمت للحفاظ على الاستقرار
      }
    }
  }

  // تجميع وإرسال النتائج
  if (allEmails.size === 0 && allPhones.size === 0) {
    await sendMessage(chatId, "لم يتم العثور على أي بيانات في المواقع المرسلة.");
    return;
  }

  if (allEmails.size > 0) {
    const emailsText = Array.from(allEmails).join('\n');
    await sendDocument(chatId, emailsText, 'emails.txt', `تم العثور على ${allEmails.size} إيميل.`);
  }

  if (allPhones.size > 0) {
    const phonesText = Array.from(allPhones).join('\n');
    await sendDocument(chatId, phonesText, 'phones.txt', `تم العثور على ${allPhones.size} رقم.`);
  }
}

