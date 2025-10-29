import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import * as cheerio from 'cheerio';

await Actor.init();

// Helper functions
const extractBrand = (c: cheerio.Cheerio<any>): string => {
  const boldElements = c.find('b, strong');
  for (let i = 0; i < boldElements.length; i++) {
    const text = boldElements.eq(i).text().trim();
    if (text && text.length > 1 && text.length < 50 && !/\$|price|cop|por|patrocinado|llega|retira/i.test(text)) return text;
  }
  
  // Fallback: extract from title or text
  const text = c.text();
  const commonBrands = ['DELL', 'HP', 'LENOVO', 'ASUS', 'ACER', 'APPLE', 'MSI', 'SAMSUNG', 'LG', 'TOSHIBA', 'SONY', 'HUAWEI', 'MICROSOFT', 'RAZER'];
  for (const b of commonBrands) {
    if (new RegExp(`\\b${b}\\b`, 'i').test(text)) return b;
  }
  
  return 'Unknown';
};

const extractTitle = (c: cheerio.Cheerio<any>, brand?: string): string => {
  let title = c.find('a[title]').first().attr('title') || c.find('img[alt]').first().attr('alt') || 
              c.text().replace(/\$[\s\d,.]+/g, '').replace(/-?\d+%/g, '').replace(/Patrocinado|Agregar al Carro|Llega mañana|Retira.*?min|Por .*/gi, '').replace(/\s+/g, ' ').trim();
  
  if (brand && brand !== 'Unknown') {
    const brandPattern = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-?\\s*`, 'i');
    title = title.replace(brandPattern, '').trim();
  }
  return title || 'Unknown Product';
};

const extractPrice = (c: cheerio.Cheerio<any>): string => {
  const price = c.find('[class*="price"], [class*="Price"]').first().text().trim().replace(/\s+/g, ' ').trim();
  return price.match(/\$\s*[\d,.]+/)?.[0]?.trim() || price;
};

const extractUrl = ($: cheerio.CheerioAPI, c: cheerio.Cheerio<any>): string => {
              const links = c.find('a[href]');
              let href = '';
  links.each((_i, link) => {
    const h = $(link).attr('href') || '';
    if (!href && h && h !== '#' && !h.startsWith('javascript:') && h !== '/' && !h.match(/\/(category|search|account|cart|checkout|help|about)/i)) {
      href = h;
      return false;
    }
    return true;
  });
  if (!href && c.is('a')) href = c.attr('href') || '';
  return (!href || href === '#') ? 'https://www.falabella.com.co/' : (href.startsWith('http') ? href : `https://www.falabella.com.co${href}`);
};

const extractImage = (c: cheerio.Cheerio<any>): string => {
  const imgs = c.find('img');
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs.eq(i);
    const src = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || img.attr('data-original') || img.attr('srcset')?.split(',')[0]?.split(' ')[0] || '';
    if (src && !src.includes('placeholder') && !src.includes('icon') && !src.includes('loading') && !src.includes('1x1')) return src.trim();
  }
  return '';
};

const extractDiscount = (c: cheerio.Cheerio<any>): string => c.find('[class*="discount"], [class*="Discount"]').first().text().trim().match(/-?\d+%/)?.[0] || '';

const extractOldPrice = (c: cheerio.Cheerio<any>): string => {
  const oldPrice = c.find('[class*="crossed"], [class*="old-price"], [class*="original"], [class*="before"], del, s, strike').first().text().trim();
  const match = oldPrice.match(/\$\s*[\d,.]+/)?.[0];
  return match ? match.replace(/\$\s+/, '$ ').trim() : '';
};

const extractProduct = ($: cheerio.CheerioAPI, c: cheerio.Cheerio<any>) => {
  const brand = extractBrand(c);
  const title = extractTitle(c, brand);
  const price = extractPrice(c);
  if (!title || title === 'Unknown Product' || !price || price.length < 2) return null;
  
  let oldPrice = extractOldPrice(c);
  const discount = extractDiscount(c);
  
  // Calculate old price from discount if missing
  if (!oldPrice && discount) {
    const discountPercent = parseInt(discount.replace(/[^\d]/g, ''));
    if (discountPercent > 0 && discountPercent < 100) {
      const currentPrice = parsePrice(price);
      const calculatedOldPrice = Math.round(currentPrice / (1 - discountPercent / 100));
      oldPrice = `$ ${calculatedOldPrice.toLocaleString('es-CO')}`;
    }
  }
  
  return { brand, title, price, oldPrice, discount, url: extractUrl($, c), image: extractImage(c) };
};

const parsePrice = (priceStr: string): number => parseInt(priceStr.replace(/[^\d]/g, '')) || 0;

// Get input
interface InputSchema {
  searchFor: 'items' | 'pages';
  searchQuery: string;
  maxProducts?: number;
  minPrice?: number;
  maxPrice?: number;
}

const input = (await Actor.getInput()) as InputSchema;
if (!input?.searchQuery?.trim()) throw new Error('Search query is required!');

const { searchFor = 'items', searchQuery, maxProducts = 100, minPrice, maxPrice } = input;
const targetUrl = `https://www.falabella.com.co/falabella-co/search?Ntt=${encodeURIComponent(searchQuery.trim())}`;

console.log(`Fetching ${searchFor}...`);

const products: { brand: string; title: string; price: string; oldPrice: string; discount: string; url: string; image: string }[] = [];
const pages: { title: string; url: string; image: string; productCount?: string }[] = [];

const crawler = new PlaywrightCrawler({
  launchContext: { launchOptions: { headless: true } },
  maxRequestsPerCrawl: 1,
  requestHandlerTimeoutSecs: 120,
  async requestHandler({ page }) {
    console.log('Processing...');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('img', { timeout: 5000 }).catch(() => {});
    
    // Quick scroll to trigger lazy-loaded images
    await page.evaluate(async () => {
      window.scrollTo(0, document.body.scrollHeight / 2);
      await new Promise(r => setTimeout(r, 500));
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 500));
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);
    
    const $ = cheerio.load(await page.content());
    
    if (searchFor === 'items') {
      let productElements = $('[class*="product-item"], [class*="ProductItem"], [data-testid*="product"], [data-pod*="product"]');
      if (productElements.length === 0) {
        productElements = $('*').filter(function() {
          const text = $(this).text();
          return /\$\s*[\d,]+/.test(text) && text.length > 30 && text.length < 1000 && $(this).find('a[href]').length > 0;
        }) as any;
      }
      
      productElements.each(function() {
        if (maxProducts > 0 && products.length >= maxProducts) return false;
        const product = extractProduct($, $(this));
        if (product && (!minPrice || parsePrice(product.price) >= minPrice) && (!maxPrice || parsePrice(product.price) <= maxPrice)) {
          products.push(product);
        }
        return true;
      });
    } else {
      $('a[href]').each(function() {
        if (maxProducts > 0 && pages.length >= maxProducts) return false;
        const href = $(this).attr('href') || '';
        if (href.includes('/category/') || href.includes('/collection/') || href.includes('/brand/') || href.includes('/search') || href.match(/falabella-co\/[a-z\-]+\/?$/)) {
          const title = $(this).text().trim() || $(this).attr('title') || $(this).attr('aria-label') || '';
          if (title && title.length > 2 && title.length < 200 && !title.match(/^\$|precio|comprar|agregar|ver más/i)) {
            const fullUrl = href.startsWith('http') ? href : `https://www.falabella.com.co${href}`;
            if (!pages.find(p => p.url === fullUrl)) {
              pages.push({ 
                title, 
                url: fullUrl, 
                image: $(this).find('img').attr('src') || $(this).find('img').attr('data-src') || '', 
                productCount: $(this).find('[class*="count"], [class*="total"], [class*="result"]').text().trim() 
              });
            }
          }
        }
        return true;
      });
    }
  },
});

await crawler.run([targetUrl]);

const finalResults = searchFor === 'items' 
  ? products.slice(0, maxProducts || products.length)
  : pages.slice(0, maxProducts || pages.length);

console.log(`Found ${finalResults.length} ${searchFor}.`);
console.log('Done.');
//@ts-ignore
await Actor.pushData(finalResults);
await Actor.exit();
