/**
 * Advanced Web Scraper - Senior Level Architecture
 * Target: USA/Canada (Emails & Phones)
 * Environment: Cloudflare Workers
 */

const CONFIG = {
  TOKEN: '8558263047:AAG5WGFNjnKFOtiLrFAjoT_Sbc9kx-MTUXk',
  TELEGRAM_URL: 'https://api.telegram.org/bot8558263047:AAG5WGFNjnKFOtiLrFAjoT_Sbc9kx-MTUXk',
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
};

// Regex Patterns
const REGEX = {
  EMAIL: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,10}/g,
  // مخصص لأمريكا وكندا: يتتبع الصيغ (XXX) XXX-XXXX أو XXX-XXX-XXXX
  PHONE: /(?:\+?1[-. ]?)?\(?([2-9][0-8][0-9])\)?[-. ]?([2-9][0-9]{2})[-. ]?([0-9]{4})/g
};

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    try {
      const payload = await request.json();
      const message = payload.message;
      if (!message || !message.text) return new Response('OK');

      const chatId = message.chat.id;
      const text = message.text.trim();

      if (text === '/start') {
        await this.sendTelegram('sendMessage', { chat_id: chatId, text: "🛡️ نظام الاستخراج الاحترافي جاهز.\nالاستهداف: أمريكا وكندا (إيميلات + هواتف بـ +1)" });
        return new Response('OK');
      }

      // معالجة الروابط وتصحيحها
      const urls = text.split('\n')
        .map(u => u.trim())
        .filter(u => u.length > 3)
        .map(u => u.startsWith('http') ? u : `https://${u}`);

      if (urls.length > 0) {
        await this.sendTelegram('sendMessage', { chat_id: chatId, text: `🔎 تم استلام ${urls.length} موقع. جاري التنظيف والتحليل العميق...` });
        ctx.waitUntil(this.processScraping(chatId, urls));
      }

      return new Response('OK');
    } catch (err) {
      return new Response('OK'); 
    }
  },

  async processScraping(chatId, urls) {
    const results = { emails: new Set(), phones: new Set() };

    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000); // 12 ثانية لكل موقع

        const response = await fetch(url, {
          headers: { 'User-Agent': CONFIG.USER_AGENT },
          signal: controller.signal
        });

        clearTimeout(timeout);
        if (!response.ok) continue;

        const html = await response.text();

        // 1. استخراج الإيميلات (Raw Extraction)
        const foundEmails = html.match(REGEX.EMAIL) || [];
        foundEmails.forEach(e => {
          const email = e.toLowerCase();
          if (!email.match(/\.(jpg|png|gif|webp|css|js|svg|pdf|woff)$/)) {
            results.emails.add(email);
          }
        });

        // 2. تنظيف المحتوى لاستخراج الهواتف بدقة (DOM Purifying)
        const sanitizedText = html
          .replace(/<(script|style|textarea|select)\b[^>]*>([\s\S]*?)<\/\1>/gi, '') // حذف الأكواد البرمجية
          .replace(/<[^>]*>/g, ' ') // تحويل الأوسمة لمساحات
          .replace(/\s\s+/g, ' '); // ضغط المساحات

        // 3. استخراج الهواتف وتنسيقها (+1)
        let match;
        while ((match = REGEX.PHONE.exec(sanitizedText)) !== null) {
          const areaCode = match[1];
          // استبعاد أرقام الأنظمة الوهمية (Area code لا يبدأ بـ 0 أو 1)
          if (!areaCode.startsWith('0') && !areaCode.startsWith('1')) {
            results.phones.add(`+1${areaCode}${match[2]}${match[3]}`);
          }
        }
      } catch (e) {
        console.error(`Error fetching ${url}:`, e.message);
      }
    }

    await this.dispatchResults(chatId, results);
  },

  async dispatchResults(chatId, results) {
    if (results.emails.size === 0 && results.phones.size === 0) {
      await this.sendTelegram('sendMessage', { chat_id: chatId, text: "⚠️ الفحص انتهى: لم يتم العثور على بيانات حقيقية مطابقة للمعايير." });
      return;
    }

    if (results.emails.size > 0) {
      const emailContent = Array.from(results.emails).sort().join('\n');
      await this.sendTelegramFile(chatId, emailContent, 'Clean_Emails.txt', `📧 استخراج ${results.emails.size} إيميل نقي.`);
    }

    if (results.phones.size > 0) {
      const phoneContent = Array.from(results.phones).sort().join('\n');
      await this.sendTelegramFile(chatId, phoneContent, 'Target_Phones.txt', `📞 استخراج ${results.phones.size} رقم (USA/CA +1).`);
    }
  },

  async sendTelegram(method, body) {
    return fetch(`${CONFIG.TELEGRAM_URL}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  },

  async sendTelegramFile(chatId, content, filename, caption) {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', caption);
    formData.append('document', new Blob([content], { type: 'text/plain' }), filename);
    
    return fetch(`${CONFIG.TELEGRAM_URL}/sendDocument`, {
      method: 'POST',
      body: formData
    });
  }
};
