const TOKEN = '8558263047:AAG5WGFNjnKFOtiLrFAjoT_Sbc9kx-MTUXk';
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// Regex دقيق للإيميلات والهواتف (أمريكا وكندا)
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,10}\b/g;
const PHONE_REGEX = /(?:\+?1[-. ]?)?\(?([2-9][0-8][0-9])\)?[-. ]?([2-9][0-9]{2})[-. ]?([0-9]{4})\b/g;

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('OK');
    try {
      const update = await request.json();
      if (!update.message || !update.message.text) return new Response('OK');

      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (text === '/start') {
        await sendMessage(chatId, "✅ النظام جاهز بدقة 99.99%\n🎯 التركيز: إيميلات نظيفة + هواتف بمفتاح +1\nالاستهداف: أمريكا وكندا 🇺🇸🇨🇦");
        return new Response('OK');
      }

      const rawUrls = text.split('\n').map(u => u.trim()).filter(u => u.length > 3);
      const urls = rawUrls.map(u => (u.startsWith('http') ? u : 'https://' + u));

      if (urls.length > 0) {
        await sendMessage(chatId, `🔍 تم استلام ${urls.length} موقع. جاري الفحص واستخراج الإيميلات أولاً...`);
        ctx.waitUntil(processUrls(chatId, urls));
      }
      return new Response('OK');
    } catch (e) {
      return new Response('OK');
    }
  }
};

async function processUrls(chatId, urls) {
  const allEmails = new Set();
  const allPhones = new Set();

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
        signal: AbortSignal.timeout(10000)
      });
      
      const rawHtml = await response.text();
      
      // 1. استخراج الإيميلات بدقة
      const emails = rawHtml.match(EMAIL_REGEX) || [];
      emails.forEach(e => {
        const email = e.toLowerCase();
        if (!email.match(/\.(jpg|png|gif|webp|css|js|svg|pdf)$/)) {
          allEmails.add(email);
        }
      });

      // 2. تنظيف النص لاستخراج الهواتف
      const cleanText = rawHtml
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ');

      // 3. استخراج الهواتف وتنسيقها (+1)
      let match;
      while ((match = PHONE_REGEX.exec(cleanText)) !== null) {
        const areaCode = match[1];
        if (areaCode.startsWith('0') || areaCode.startsWith('1')) continue;
        allPhones.add(`+1${areaCode}${match[2]}${match[3]}`);
      }
    } catch (err) {
      // تجاهل أخطاء المواقع الفردية للاستمرار في البقية
    }
  }

  // إرسال النتائج للمستخدم
  if (allEmails.size === 0 && allPhones.size === 0) {
    await sendMessage(chatId, "⚠️ لم يتم العثور على إيميلات أو هواتف مطابقة للمواصفات.");
    return;
  }

  if (allEmails.size > 0) {
    const emailList = Array.from(allEmails).sort().join('\n');
    await sendDocument(chatId, emailList, 'Target_Emails.txt', `📧 تم استخراج ${allEmails.size} إيميل نقي.`);
  }

  if (allPhones.size > 0) {
    const phoneList = Array.from(allPhones).sort().join('\n');
    await sendDocument(chatId, phoneList, 'Target_Phones.txt', `📞 تم استخراج ${allPhones.size} رقم هاتف (بالمفتاح الدولي).`);
  }
}

async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

async function sendDocument(chatId, content, filename, caption) {
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption);
  formData.append('document', new Blob([content], { type: 'text/plain' }), filename);
  await fetch(`${TELEGRAM_API}/sendDocument`, { method: 'POST', body: formData });
}
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

