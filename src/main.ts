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

const extractImage = ($: cheerio.CheerioAPI, c: cheerio.Cheerio<any>, imageMap: Map<string, string>): string => {
  // Try imageMap first (pre-extracted from Playwright)
  const url = extractUrl($, c);
  if (imageMap.has(url)) return imageMap.get(url)!;
  
  // Fallback: construct from product URL
  const productIdMatch = url.match(/\/product\/\d+\/[^/]+\/(\d{6,})$/);
  if (productIdMatch) return `https://media.falabella.com.co/falabellaCO/${productIdMatch[1]}_01/public`;
  
  return '';
};

const extractDiscount = (c: cheerio.Cheerio<any>): string => c.find('[class*="discount"], [class*="Discount"]').first().text().trim().match(/-?\d+%/)?.[0] || 'N/A';

const extractOldPrice = (c: cheerio.Cheerio<any>): string => {
  const oldPrice = c.find('[class*="crossed"], [class*="old-price"], [class*="original"], [class*="before"], del, s, strike').first().text().trim();
  const match = oldPrice.match(/\$\s*[\d,.]+/)?.[0];
  return match ? match.replace(/\$\s+/, '$ ').trim() : 'N/A';
};

const extractProduct = ($: cheerio.CheerioAPI, c: cheerio.Cheerio<any>, imageMap: Map<string, string>) => {
  const title = extractTitle(c);
  const price = extractPrice(c);
  if (!title || title === 'Unknown Product' || !price || price.length < 2) return null;
  
  let oldPrice = extractOldPrice(c);
  const discount = extractDiscount(c);
  
  // Parse numeric prices
  const priceNumeric = parsePrice(price);
  
  // Calculate old price from discount if missing
  if (oldPrice === 'N/A' && discount !== 'N/A') {
    const discountPercent = parseInt(discount.replace(/[^\d]/g, ''));
    if (discountPercent > 0 && discountPercent < 100) {
      oldPrice = `$ ${Math.round(priceNumeric / (1 - discountPercent / 100)).toLocaleString('es-CO')}`;
    }
  }
  
  const oldPriceNumeric = oldPrice === 'N/A' ? null : parsePrice(oldPrice);
  
  return { 
    title, 
    price, 
    priceNumeric,
    oldPrice: discount === 'N/A' ? 'N/A' : oldPrice, 
    oldPriceNumeric,
    discount, 
    url: extractUrl($, c), 
    image: extractImage($, c, imageMap) 
  };
};

const parsePrice = (priceStr: string): number => parseInt(priceStr.replace(/[^\d]/g, '')) || 0;

// Get input
const input = await Actor.getInput<{ searchFor?: 'items' | 'pages'; searchQuery: string; maxProducts?: number; minPrice?: number; maxPrice?: number }>();
if (!input?.searchQuery?.trim()) throw new Error('Search query is required!');

const { searchFor = 'items', searchQuery, maxProducts = 100, minPrice, maxPrice } = input;

console.log(`Fetching ${searchFor}...`);

const products: { title: string; price: string; priceNumeric: number; oldPrice: string; oldPriceNumeric: number | null; discount: string; url: string; image: string }[] = [];
const seenUrls = new Set<string>(); // Track URLs to avoid duplicates in real-time

const crawler = new PlaywrightCrawler({
  launchContext: { 
    launchOptions: { 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    } 
  },
  maxRequestsPerCrawl: 999, // Will stop automatically when maxProducts is reached
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
    
    // Extract products
    let productElements = $('[class*="product-item"], [class*="ProductItem"], [data-testid*="product"], [data-pod*="product"]');
    if (productElements.length === 0) {
      productElements = $('*').filter(function() {
        const text = $(this).text();
        return /\$\s*[\d,]+/.test(text) && text.length > 30 && text.length < 1000 && $(this).find('a[href]').length > 0;
      }) as any;
    }
    
    productElements.each(function() {
      if (maxProducts > 0 && products.length >= maxProducts) return false;
      
      const product = extractProduct($, $(this), imageMap);
      if (product && !seenUrls.has(product.url)) {
        seenUrls.add(product.url);
        products.push(product);
      }
      return true;
    });
    
    if (searchFor === 'items' && maxProducts > 0 && products.length >= maxProducts) {
      await crawler.autoscaledPool?.abort();
    }
  },
});

// Generate URLs to crawl
const urlsToScrape: string[] = [];
const priceFilter = (minPrice || maxPrice) ? `&r.derived.price.search=${maxPrice || 999999999}%3A%3A${minPrice || 0}` : '';

if (searchFor === 'pages') {
  // Generate multiple page URLs with price filter
  const numPages = maxProducts || 10;
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    urlsToScrape.push(`https://www.falabella.com.co/falabella-co/search?Ntt=${encodeURIComponent(searchQuery)}&page=${pageNum}${priceFilter}`);
  }
} else {
  // For items mode, estimate how many pages we might need (assuming ~50-60 items per page)
  const estimatedPages = Math.ceil((maxProducts || 100) / 50) + 1; // Add 1 extra page as buffer
  for (let pageNum = 1; pageNum <= Math.min(estimatedPages, 10); pageNum++) { // Max 10 pages
    urlsToScrape.push(`https://www.falabella.com.co/falabella-co/search?Ntt=${encodeURIComponent(searchQuery)}&page=${pageNum}${priceFilter}`);
  }
}

await crawler.run(urlsToScrape);

console.log(`Found ${products.length} items from ${searchFor === 'pages' ? urlsToScrape.length + ' pages' : 'multiple pages'}.`);
console.log('Done.');
await Actor.pushData(products);
await Actor.exit();

