const TOKEN = '8558263047:AAG5WGFNjnKFOtiLrFAjoT_Sbc9kx-MTUXk';
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// تعبيرات نمطية دقيقة جداً
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,10}\b/g;
// الهواتف: مخصصة لأمريكا وكندا بمختلف الصيغ
const PHONE_REGEX = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const LINK_REGEX = /href=["']([^"']+)["']/g;

// قائمة سوداء لتجاهل الروابط غير المفيدة
const BLACKLIST_DOMAINS = ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'pinterest.com', 'tiktok.com'];
const IGNORED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.css', '.js', '.svg', '.mp4', '.pdf', '.webp', '.woff2'];

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('OK', { status: 200 });

    try {
      const update = await request.json();
      if (!update.message || !update.message.text) return new Response('OK', { status: 200 });

      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (text === '/start') {
        await sendMessage(chatId, "النظام جاهز. أرسل المواقع (بدون الحاجة لـ http). الدقة 99.99% لأمريكا وكندا.");
        return new Response('OK', { status: 200 });
      }

      // معالجة الروابط وتصحيحها تلقائياً
      const rawUrls = text.split('\n').map(u => u.trim()).filter(u => u.length > 3);
      const urls = rawUrls.map(u => {
        let clean = u;
        if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
          clean = 'https://' + clean;
        }
        return clean;
      });

      if (urls.length > 0) {
        await sendMessage(chatId, `تم استلام ${urls.length} موقع. جاري الفحص العميق (الاستهداف: USA/CA)...`);
        ctx.waitUntil(processUrls(chatId, urls));
      }

      return new Response('OK', { status: 200 });
    } catch (e) {
      return new Response('Error', { status: 500 });
    }
  }
};

async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}

async function sendDocument(chatId, content, filename, caption) {
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption);
  formData.append('document', new Blob([content], { type: 'text/plain' }), filename);

  await fetch(`${TELEGRAM_API}/sendDocument`, { method: 'POST', body: formData });
}

// دالة تنظيف الإيميلات
function isValidEmail(email) {
  const lower = email.toLowerCase();
  for (const ext of IGNORED_EXTENSIONS) {
    if (lower.endsWith(ext) || lower.includes('wixpress') || lower.includes('sentry') || lower.includes('no-reply')) return false;
  }
  return true;
}

// دالة تنظيف وتنسيق الهواتف (أمريكا وكندا فقط)
function formatUSAPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  // رقم أمريكي/كندي صالح يجب أن يكون 10 أرقام، أو 11 ويبدأ بـ 1
  if (digits.length === 10) {
    return `+1-${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+1-${digits.slice(1,4)}-${digits.slice(4,7)}-${digits.slice(7)}`;
  }
  return null;
}

async function processUrls(chatId, urls) {
  const allEmails = new Set();
  const allPhones = new Set();

  for (const startUrl of urls) {
    const visited = new Set();
    const queue = [startUrl];
    let domain = '';
    
    try {
      domain = new URL(startUrl).hostname.replace('www.', '');
    } catch (e) { continue; }

    let pagesChecked = 0;

    while (queue.length > 0 && pagesChecked < 10) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);
      pagesChecked++;

      try {
        const response = await fetch(url, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(5000) 
        });
        
        if (!response.ok) continue;
        const html = await response.text();

        // الإيميلات
        const emails = html.match(EMAIL_REGEX) || [];
        emails.forEach(e => {
          if (isValidEmail(e)) allEmails.add(e.toLowerCase());
        });

        // الهواتف
        const phones = html.match(PHONE_REGEX) || [];
        phones.forEach(p => {
          const formatted = formatUSAPhone(p);
          if (formatted) allPhones.add(formatted);
        });

        // الروابط للعمق
        let match;
        while ((match = LINK_REGEX.exec(html)) !== null) {
          try {
            let fullUrl = match[1];
            if (fullUrl.startsWith('/')) fullUrl = new URL(fullUrl, url).href;
            
            const linkUrl = new URL(fullUrl);
            const linkDomain = linkUrl.hostname.replace('www.', '');
            
            const isInternal = linkDomain === domain || linkDomain.endsWith(`.${domain}`);
            const isNotFile = !IGNORED_EXTENSIONS.some(ext => linkUrl.pathname.toLowerCase().endsWith(ext));
            const isNotBlacklisted = !BLACKLIST_DOMAINS.some(b => linkDomain.includes(b));

            if (isInternal && isNotFile && isNotBlacklisted && !visited.has(fullUrl)) {
              queue.push(fullUrl);
            }
          } catch (err) {} 
        }
      } catch (err) {}
    }
  }

  if (allEmails.size === 0 && allPhones.size === 0) {
    await sendMessage(chatId, "انتهى الفحص: لم يتم العثور على بيانات مطابقة لمعايير الاستهداف.");
    return;
  }

  if (allEmails.size > 0) {
    const sortedEmails = Array.from(allEmails).sort().join('\n');
    await sendDocument(chatId, sortedEmails, 'Emails_USA_CA.txt', `تم العثور على ${allEmails.size} إيميل نقي.`);
  }

  if (allPhones.size > 0) {
    const sortedPhones = Array.from(allPhones).sort().join('\n');
    await sendDocument(chatId, sortedPhones, 'Phones_USA_CA.txt', `تم العثور على ${allPhones.size} رقم (مفلتر لأمريكا وكندا).`);
  }
}
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

