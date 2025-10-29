import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import * as cheerio from 'cheerio';

await Actor.init();

// Helper functions
const extractTitle = (c: cheerio.Cheerio<any>): string => {
  let title = c.find('a[title]').first().attr('title') || c.find('img[alt]').first().attr('alt') || 
              c.text().replace(/\$[\s\d,.]+/g, '').replace(/-?\d+%/g, '').replace(/Envío gratis|Patrocinado|Agregar al Carro|Llega mañana|Retira.*?min|Por .*|Solo en falabella\.com|Con tu tarjeta CMR/gi, '').replace(/\s+/g, ' ').trim();
  
  // Fix spacing issues where brand name is concatenated with product name
  title = title.replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2');
  
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

const extractImage = (c: cheerio.Cheerio<any>, imageMap?: Map<string, string>): string => {
  // First try to get from imageMap (pre-extracted from Playwright)
  if (imageMap) {
    const url = extractUrl(cheerio.load(''), c);
    const mappedImage = imageMap.get(url);
    if (mappedImage) return mappedImage;
  }
  
  // Fallback to cheerio extraction - try multiple attributes
  const imgs = c.find('img');
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs.eq(i);
    const src = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || img.attr('data-original') || img.attr('data-lazy') || img.attr('data-image') || img.attr('srcset')?.split(',')[0]?.split(' ')[0] || '';
    if (src && src.length > 5 && !src.includes('placeholder') && !src.includes('icon') && !src.includes('loading') && !src.includes('1x1') && !src.startsWith('data:')) {
      return src.startsWith('//') ? `https:${src}` : src.trim();
    }
  }
  
  // Last resort: construct image URL from product URL
  const url = extractUrl(cheerio.load(''), c);
  const productIdMatch = url.match(/\/product\/(\d{6,})\//);  // Match product ID from URL
  if (productIdMatch) {
    const nextNum = url.match(/\/(\d{6,})$/); // The second number after product ID
    const imageId = nextNum ? nextNum[1] : productIdMatch[1];
    return `https://media.falabella.com.co/falabellaCO/${imageId}_01/public`;
  }
  
  return '';
};

const extractDiscount = (c: cheerio.Cheerio<any>): string => c.find('[class*="discount"], [class*="Discount"]').first().text().trim().match(/-?\d+%/)?.[0] || 'N/A';

const extractOldPrice = (c: cheerio.Cheerio<any>): string => {
  const oldPrice = c.find('[class*="crossed"], [class*="old-price"], [class*="original"], [class*="before"], del, s, strike').first().text().trim();
  const match = oldPrice.match(/\$\s*[\d,.]+/)?.[0];
  return match ? match.replace(/\$\s+/, '$ ').trim() : 'N/A';
};

const extractProduct = ($: cheerio.CheerioAPI, c: cheerio.Cheerio<any>, imageMap?: Map<string, string>) => {
  const title = extractTitle(c);
  const price = extractPrice(c);
  if (!title || title === 'Unknown Product' || !price || price.length < 2) return null;
  
  let oldPrice = extractOldPrice(c);
  const discount = extractDiscount(c);
  
  // Calculate old price from discount if missing
  if (oldPrice === 'N/A' && discount !== 'N/A') {
    const discountPercent = parseInt(discount.replace(/[^\d]/g, ''));
    if (discountPercent > 0 && discountPercent < 100) {
      const currentPrice = parsePrice(price);
      const calculatedOldPrice = Math.round(currentPrice / (1 - discountPercent / 100));
      oldPrice = `$ ${calculatedOldPrice.toLocaleString('es-CO')}`;
    }
  }
  
  // If discount is N/A, oldPrice should also be N/A
  if (discount === 'N/A') {
    oldPrice = 'N/A';
  }
  
  return { title, price, oldPrice, discount, url: extractUrl($, c), image: extractImage(c, imageMap) };
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

// Build URL with price filter if provided
let targetUrl = `https://www.falabella.com.co/falabella-co/search?Ntt=${encodeURIComponent(searchQuery.trim())}`;
if (minPrice || maxPrice) {
  const min = minPrice || 0;
  const max = maxPrice || 999999999;
  targetUrl += `&r.derived.price.search=${max}%3A%3A${min}`;
}

console.log(`Fetching ${searchFor}...`);

const products: { title: string; price: string; oldPrice: string; discount: string; url: string; image: string }[] = [];

const crawler = new PlaywrightCrawler({
  launchContext: { 
    launchOptions: { 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    } 
  },
  maxRequestsPerCrawl: searchFor === 'pages' ? (maxProducts || 10) : 1,
  maxConcurrency: 1, // Reduce concurrency to avoid CPU overload
  requestHandlerTimeoutSecs: 180,
  async requestHandler({ page, request }) {
    console.log(`Processing... ${request.url}`);
    await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    
    // Wait for images to start loading
    await page.waitForSelector('img', { timeout: 5000 }).catch(() => {});
    
    // Progressive scroll to trigger all lazy-loaded images
    await page.evaluate(async () => {
      const distance = 500;
      const delay = 100;
      while (window.scrollY + window.innerHeight < document.body.scrollHeight) {
        window.scrollBy(0, distance);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      window.scrollTo(0, 0);
    });
    
    // Wait for images to load
    await page.waitForTimeout(2000);
    
    // Extract images directly from the DOM via Playwright
    const imageMap = new Map<string, string>();
    const imageData = await page.evaluate(() => {
      const results: Array<{url: string; image: string}> = [];
      document.querySelectorAll('a[href]').forEach((link) => {
        const href = (link as HTMLAnchorElement).href;
        if (href && href.includes('/product/')) {
          const img = link.querySelector('img');
          if (img) {
            const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
            if (src && !src.includes('placeholder') && !src.includes('1x1')) {
              results.push({ url: href, image: src });
            }
          }
        }
      });
      return results;
    });
    imageData.forEach(item => imageMap.set(item.url, item.image));
    
    const $ = cheerio.load(await page.content());
    
    // Extract products from the page (same logic for both items and pages)
    let productElements = $('[class*="product-item"], [class*="ProductItem"], [data-testid*="product"], [data-pod*="product"]');
    if (productElements.length === 0) {
      productElements = $('*').filter(function() {
          const text = $(this).text();
        return /\$\s*[\d,]+/.test(text) && text.length > 30 && text.length < 1000 && $(this).find('a[href]').length > 0;
      }) as any;
    }
    
    productElements.each(function() {
      const product = extractProduct($, $(this), imageMap);
      if (product) {
        products.push(product);
      }
      return true;
    });
  },
});

// Generate URLs to crawl
const urlsToScrape: string[] = [];
if (searchFor === 'pages') {
  // Generate multiple page URLs with price filter
  const numPages = maxProducts || 10;
  const priceFilter = (minPrice || maxPrice) ? `&r.derived.price.search=${maxPrice || 999999999}%3A%3A${minPrice || 0}` : '';
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    urlsToScrape.push(`https://www.falabella.com.co/falabella-co/search?Ntt=${encodeURIComponent(searchQuery)}&page=${pageNum}${priceFilter}`);
  }
} else {
  // Single page for items
  urlsToScrape.push(targetUrl);
}

await crawler.run(urlsToScrape);

// Deduplicate products by URL
const seen = new Set<string>();
const finalResults = products.filter(p => {
  if (seen.has(p.url)) return false;
  seen.add(p.url);
  return true;
});

console.log(`Found ${finalResults.length} items from ${searchFor === 'pages' ? urlsToScrape.length + ' pages' : '1 page'}.`);
console.log('Done.');
//@ts-ignore
await Actor.pushData(finalResults);
await Actor.exit();
