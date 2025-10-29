# Falabella Product Scraper

**Find the best deals on Falabella.com.co instantly!** 🛍️

This scraper helps you search and extract product information from Falabella Colombia's online store. Perfect for price comparison, market research, or finding the best deals on your favorite products.

## 🎯 What You Get

For each product, you'll receive:
- **Brand** - Product manufacturer
- **Title** - Full product name and description
- **Current Price** - Sale price in Colombian Pesos (COP)
- **Original Price** - Before discount (if available)
- **Discount** - Percentage off (if on sale)
- **Product URL** - Direct link to buy
- **Image** - Product photo URL

## 🚀 How to Use

### Simple Search
Just enter what you're looking for:
- **Search Query**: "laptop", "smartphone", "sofa", etc.

### Advanced Options
- **Maximum Products**: Limit how many results you want (default: 100)
- **Minimum Price**: Filter products above a certain price (in COP)
- **Maximum Price**: Filter products below a certain price (in COP)

## 💡 Example Searches

### Find Laptops
```json
{
  "searchQuery": "laptop",
  "maxProducts": 50
}
```

### Find Gaming Laptops Under 3 Million COP
```json
{
  "searchQuery": "laptop gamer",
  "maxProducts": 100,
  "maxPrice": 3000000
}
```

### Find Premium Smartphones
```json
{
  "searchQuery": "smartphone",
  "minPrice": 1000000,
  "maxProducts": 30
}
```

### Find Affordable Home Furniture
```json
{
  "searchQuery": "muebles sala",
  "maxPrice": 500000,
  "maxProducts": 50
}
```

## 📊 Output Format

Results are returned as structured data (JSON) that you can easily export to Excel, CSV, or integrate with other tools:

```json
[
  {
    "brand": "LENOVO",
    "title": "Portátil Ideapad Slim 3 | AMD Ryzen 7 | 16GB RAM | 512GB SSD",
    "price": "$ 2.099.900",
    "oldPrice": "$ 3.799.900",
    "discount": "-45%",
    "url": "https://www.falabella.com.co/...",
    "image": "https://..."
  }
]
```

## ⚡ Performance

- **Fast**: Uses lightweight HTTP scraping (no browser needed)
- **Efficient**: Processes hundreds of products in seconds
- **Reliable**: Built with anti-bot detection in mind

## 🔧 Tips for Best Results

1. **Be Specific**: "laptop gaming" works better than just "computador"
2. **Use Spanish**: Falabella Colombia works best with Spanish search terms
3. **Price Filters**: Use min/max price to narrow down results quickly
4. **Limit Results**: Set maxProducts to avoid overwhelming data

## 📝 Notes

- Prices are in Colombian Pesos (COP)
- Results are deduplicated automatically
- Product availability may change after scraping
- Respects Falabella's website structure

## 🛠️ Technical Details

- **Platform**: Apify Actor
- **Method**: Cheerio-based HTML parsing
- **Speed**: ~100-500 products per run (depending on settings)
- **Data Quality**: Clean, structured, deduplicated

---

**Need help?** Check out the [Apify documentation](https://docs.apify.com) or contact support.

**Happy shopping!** 🎉
