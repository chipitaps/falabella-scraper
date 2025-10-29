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
const targetUrl = `https://www.falabella.com.co/falabella-co/search?Ntt=${encodeURIComponent(searchQuery.trim())}`;

console.log(`Fetching ${searchFor}...`);

const products: { title: string; price: string; oldPrice: string; discount: string; url: string; image: string }[] = [];

const crawler = new PlaywrightCrawler({
  launchContext: { launchOptions: { headless: true } },
  maxRequestsPerCrawl: searchFor === 'pages' ? (maxProducts || 10) : 1,
  requestHandlerTimeoutSecs: 120,
  async requestHandler({ page, request }) {
    console.log(`Processing... ${request.url}`);
    await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('img', { timeout: 5000 }).catch(() => {});
    
    // Progressive scroll to trigger lazy-loaded images and wait for them to load
    await page.evaluate(async () => {
      const scrollHeight = document.body.scrollHeight;
      const steps = 5;
      for (let i = 0; i <= steps; i++) {
        window.scrollTo(0, (scrollHeight / steps) * i);
        await new Promise(r => setTimeout(r, 500));
      }
      // Scroll back to top
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 500));
    });
    
    // Wait for all images to have src attributes
    await page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll('img'));
      const withSrc = images.filter(img => img.src && img.src !== '' && !img.src.includes('data:image'));
      return images.length > 0 && withSrc.length > images.length * 0.7;
    }, { timeout: 10000 }).catch(() => {});
    
    await page.waitForTimeout(1500);
    
    // Extract images directly from the DOM via Playwright
    const imageMap = new Map<string, string>();
    const imageData = await page.evaluate(() => {
      const results: Array<{url: string; image: string}> = [];
      document.querySelectorAll('a[href]').forEach((link) => {
        const href = (link as HTMLAnchorElement).href;
        if (href && (href.includes('/product/') || href.includes('/falabella-co/'))) {
          const img = link.querySelector('img');
          if (img && img.src && !img.src.includes('placeholder') && !img.src.includes('1x1')) {
            results.push({ url: href, image: img.src });
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
      if (product && (!minPrice || parsePrice(product.price) >= minPrice) && (!maxPrice || parsePrice(product.price) <= maxPrice)) {
        products.push(product);
      }
      return true;
    });
  },
});

// Generate URLs to crawl
const urlsToScrape: string[] = [];
if (searchFor === 'pages') {
  // Generate multiple page URLs
  const numPages = maxProducts || 10;
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    urlsToScrape.push(`https://www.falabella.com.co/falabella-co/search?Ntt=${encodeURIComponent(searchQuery)}&page=${pageNum}`);
  }
} else {
  // Single page for items
  urlsToScrape.push(targetUrl);
}

await crawler.run(urlsToScrape);

const finalResults = products;

console.log(`Found ${finalResults.length} items from ${searchFor === 'pages' ? urlsToScrape.length + ' pages' : '1 page'}.`);
console.log('Done.');
//@ts-ignore
await Actor.pushData(finalResults);
await Actor.exit();
