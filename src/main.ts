import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import * as cheerio from 'cheerio';

await Actor.init();

// -------- Helper utilities --------
function getRequestConfig(referer: string, timeout = 15000) {
  return {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Referer': referer,
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
    },
    timeout,
  };
}

function extractBrand(c: cheerio.Cheerio<any>): string {
  // Try to find bold text first (Falabella shows brand in bold)
  const boldElements = c.find('b, strong');
  for (let i = 0; i < boldElements.length; i++) {
    const elem = boldElements.eq(i);
    const text = elem.text().trim();
    if (text && text.length > 1 && text.length < 50 && !/\$|price|cop|por|patrocinado|llega|retira/i.test(text)) {
      return text;
    }
  }
  
  return 'Unknown';
}

function extractTitle(c: cheerio.Cheerio<any>, brand?: string): string {
  let title = '';
  
  // Try getting from link title attribute first
  const linkTitle = c.find('a[title]').first().attr('title');
  if (linkTitle && linkTitle.trim().length > 5) {
    title = linkTitle.trim();
  } else {
    // Try image alt text
    const imgAlt = c.find('img[alt]').first().attr('alt');
    if (imgAlt && imgAlt.trim().length > 5) {
      title = imgAlt.trim();
    } else {
      // Extract full text but clean it up
      const fullText = c.text().replace(/\s+/g, ' ').trim();
      
      // Remove price parts and other noise
      title = fullText
        .replace(/\$[\s\d,.]+/g, '')
        .replace(/-?\d+%/g, '')
        .replace(/Patrocinado|Agregar al Carro|Llega mañana|Retira.*?min|Por .*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
  
  // Remove brand from the beginning if it's redundant (e.g., "HP - Laptop..." when brand is "HP")
  if (brand && brand !== 'Unknown') {
    // Match brand at the start, optionally followed by " - " or just spaces
    const brandPattern = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-?\\s*`, 'i');
    title = title.replace(brandPattern, '').trim();
  }
  
  return title || 'Unknown Product';
}

function extractPrice(c: cheerio.Cheerio<any>): string {
  const priceElement = c.find('[class*="price"], [class*="Price"], .product-price, [data-testid="price"]').first();
  let price = priceElement.text().trim();
  
  // Clean up price
  price = price.replace(/\s+/g, ' ').trim();
  
  // Extract only the numeric price if there are multiple prices (discounted)
  const priceMatch = price.match(/\$\s*[\d,.]+/);
  if (priceMatch) return priceMatch[0].trim();
  
  return price;
}

function extractUrl($: cheerio.CheerioAPI, c: cheerio.Cheerio<any>): string {
  // Try to find product link
  const links = c.find('a[href]');
  let bestHref = '';
  
  links.each(function(_i, link) {
    const href = $(link).attr('href') || '';
    // Skip empty, anchor-only, or navigation links
    if (!href || href === '#' || href.startsWith('javascript:') || href === '/') return true;
    
    // Skip common navigation paths
    if (href.match(/\/(category|search|account|cart|checkout|help|about)/i)) return true;
    
    // Take first non-navigation link
    if (!bestHref) {
      bestHref = href;
      return false; // Break after first match
    }
    return true;
  });
  
  if (!bestHref) {
    // Last resort: check if element itself is a link
    if (c.is('a')) {
      bestHref = c.attr('href') || '';
    }
  }
  
  if (!bestHref || bestHref === '#') return 'https://www.falabella.com.co/';
  
  if (!bestHref.startsWith('http')) {
    bestHref = `https://www.falabella.com.co${bestHref}`;
  }
  
  return bestHref;
}

function extractImage(c: cheerio.Cheerio<any>): string {
  // Try multiple image source attributes
  const imgs = c.find('img');
  
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs.eq(i);
    const src = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || 
                img.attr('data-original') || img.attr('srcset')?.split(',')[0]?.split(' ')[0] || '';
    
    // Skip placeholder images, icons, and very small images
    if (src && !src.includes('placeholder') && !src.includes('icon') && 
        !src.includes('loading') && !src.includes('1x1')) {
      return src.trim();
    }
  }
  
  return '';
}

function extractDiscount(c: cheerio.Cheerio<any>): string {
  const discount = c.find('[class*="discount"], [class*="Discount"], .product-discount').first().text().trim();
  const match = discount.match(/-?\d+%/);
  return match ? match[0] : '';
}

function extractOldPrice(c: cheerio.Cheerio<any>): string {
  // Look for crossed-out prices (Falabella uses "crossed" class)
  const oldPriceEl = c.find('[class*="crossed"], [class*="old-price"], [class*="original"], [class*="before"], del, s, strike').first();
  let oldPrice = oldPriceEl.text().trim();
  const priceMatch = oldPrice.match(/\$\s*[\d,.]+/);
  if (priceMatch) return priceMatch[0].trim();
  return '';
}

function extractProduct($: cheerio.CheerioAPI, c: cheerio.Cheerio<any>): { brand: string; title: string; price: string; oldPrice: string; discount: string; url: string; image: string } | null {
  const brand = extractBrand(c);
  const title = extractTitle(c, brand);
  const price = extractPrice(c);
  const url = extractUrl($, c);
  const image = extractImage(c);
  const discount = extractDiscount(c);
  const oldPrice = extractOldPrice(c);
  
  // Must have at least title and price
  if (!title || title === 'Unknown Product') return null;
  if (!price || price.length < 2) return null;
  
  // If no image found, use a placeholder or empty string
  // (Some products might not have images in the search results)
  
  return { brand, title, price, oldPrice, discount, url, image };
}

function cleanAndDedup(products: Array<{ brand: string; title: string; price: string; oldPrice: string; discount: string; url: string; image: string }>) {
  const cleaned = products.map(p => ({
    brand: p.brand.trim(),
    title: p.title.replace(/\s+/g, ' ').trim(),
    price: p.price.replace(/\s+/g, ' ').trim(),
    oldPrice: p.oldPrice.replace(/\s+/g, ' ').trim(),
    discount: p.discount.trim(),
    url: p.url.trim(),
    image: p.image.trim(),
  })).filter(p => p.title && p.price);
  
  const map = new Map<string, typeof cleaned[number]>();
  for (const p of cleaned) {
    // Use title + price for deduplication (URL might be same for all)
    const key = `${p.title}|${p.price}`;
    if (!map.has(key)) map.set(key, p);
  }
  
  return Array.from(map.values());
}

function parsePrice(priceStr: string): number {
  const cleaned = priceStr.replace(/[^\d]/g, '');
  return parseInt(cleaned) || 0;
}

interface InputSchema {
  searchFor: 'items' | 'pages';
  searchQuery: string;
  maxProducts?: number;
  minPrice?: number;
  maxPrice?: number;
}

const input = (await Actor.getInput()) as InputSchema;
if (!input) throw new Error('Input is missing!');

const { searchFor = 'items', searchQuery, maxProducts = 100, minPrice, maxPrice } = input;

if (!searchQuery || searchQuery.trim() === '') {
  throw new Error('Search query is required!');
}

const encodedQuery = encodeURIComponent(searchQuery.trim());
const targetUrl = `https://www.falabella.com.co/falabella-co/search?Ntt=${encodedQuery}`;

console.log(`Fetching ${searchFor}...`);

const products: { brand: string; title: string; price: string; oldPrice: string; discount: string; url: string; image: string }[] = [];
const pages: { title: string; url: string; image: string; productCount?: string }[] = [];

const crawler = new PlaywrightCrawler({
  launchContext: {
    launchOptions: {
      headless: true,
    },
  },
  maxRequestsPerCrawl: 1,
  async requestHandler({ page, request }) {
    console.log('Processing...');
    
    // Wait for the page to load
    await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for product elements to appear
    await page.waitForSelector('img', { timeout: 10000 }).catch(() => {});
    
    // Scroll progressively to trigger ALL lazy-loaded images
    await page.evaluate(async () => {
      const distance = 300;
      const delay = 100;
      
      while (window.scrollY + window.innerHeight < document.body.scrollHeight) {
        window.scrollBy(0, distance);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Scroll back to top to ensure all images are in viewport
      window.scrollTo(0, 0);
    });
    
    // Wait for images to load
    await page.waitForTimeout(2000);
    
    // Force load any remaining lazy images
    await page.evaluate(() => {
      document.querySelectorAll('img[data-src]').forEach(img => {
        const dataSrc = img.getAttribute('data-src');
        if (dataSrc && !img.getAttribute('src')) {
          img.setAttribute('src', dataSrc);
        }
      });
    });
    
    await page.waitForTimeout(500);
    
    const html = await page.content();
    const $ = cheerio.load(html);
    
    if (searchFor === 'items') {
      // Search for individual products
      let productElements = $('[class*="product-item"], [class*="ProductItem"], [data-testid*="product"], [data-pod*="product"]');
      
      if (productElements.length === 0) {
        // Fallback: look for any element with price patterns
        productElements = $('*').filter(function(_i, el) {
          const $el = $(el);
          const text = $el.text();
          // Must contain a price and reasonable content length
          return /\$\s*[\d,]+/.test(text) && text.length > 30 && text.length < 1000 &&
                 // Must have a link
                 $el.find('a[href]').length > 0;
        }) as any;
      }
      
      productElements.each(function(_i, el) {
        if (maxProducts > 0 && products.length >= maxProducts) return false;
        
        const $el = $(el);
        const product = extractProduct($, $el);
        
        if (product) {
          // Apply price filters if specified
          if (minPrice || maxPrice) {
            const productPrice = parsePrice(product.price);
            if (minPrice && productPrice < minPrice) return true;
            if (maxPrice && productPrice > maxPrice) return true;
          }
          
          products.push(product);
        }
        return true;
      });
    } else {
      // Search for pages/categories - look for links that go to product pages or categories
      const linkElements = $('a[href]');
      
      linkElements.each(function(_i, el) {
        if (maxProducts > 0 && pages.length >= maxProducts) return false;
        
        const $el = $(el);
        const href = $el.attr('href') || '';
        
        // Look for category, collection, or brand pages
        if (href.includes('/category/') || href.includes('/collection/') || 
            href.includes('/brand/') || href.includes('/search') ||
            href.match(/falabella-co\/[a-z\-]+\/?$/)) {
          
          const title = $el.text().trim() || $el.attr('title') || $el.attr('aria-label') || '';
          const image = $el.find('img').attr('src') || $el.find('img').attr('data-src') || '';
          
          // Extract product count if available
          const productCount = $el.find('[class*="count"], [class*="total"], [class*="result"]').text().trim();
          
          if (title && title.length > 2 && title.length < 200 && 
              !title.match(/^\$|precio|comprar|agregar|ver más/i)) {
            const fullUrl = href.startsWith('http') ? href : `https://www.falabella.com.co${href}`;
            
            // Check if we already have this URL
            if (!pages.find(p => p.url === fullUrl)) {
              pages.push({ title, url: fullUrl, image, productCount });
            }
          }
        }
        return true;
      });
    }
  },
});

await crawler.run([targetUrl]);

if (searchFor === 'items') {
  // Apply max limit for products
  let finalProducts = products;
  if (maxProducts > 0 && finalProducts.length > maxProducts) {
    finalProducts = finalProducts.slice(0, maxProducts);
  }

  console.log(`Found ${finalProducts.length} products.`);
  console.log('Done.');

  await Actor.pushData(finalProducts);
} else {
  // Apply max limit for pages
  let finalPages = pages;
  if (maxProducts > 0 && finalPages.length > maxProducts) {
    finalPages = finalPages.slice(0, maxProducts);
  }

  console.log(`Found ${finalPages.length} pages.`);
  console.log('Done.');

  await Actor.pushData(finalPages);
}
await Actor.exit();
