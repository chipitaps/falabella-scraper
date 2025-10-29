# Extractor de Productos Falabella

**¡Encuentra las mejores ofertas en Falabella.com.co al instante!** 🛍️

Este extractor te ayuda a buscar y extraer información de productos de la tienda online de Falabella Colombia. Perfecto para comparación de precios, investigación de mercado o encontrar las mejores ofertas en tus productos favoritos.

## 🎯 Lo Que Obtienes

Para cada producto, recibirás:
- **Título** - Nombre completo del producto con marca
- **Precio Actual** - Precio de venta en Pesos Colombianos (COP)
- **Precio Original** - Antes del descuento (si está disponible)
- **Descuento** - Porcentaje de rebaja (si está en oferta)
- **URL del Producto** - Enlace directo para comprar
- **Imagen** - URL de la foto del producto

## 🚀 Cómo Usar

### Búsqueda Simple
Solo ingresa lo que estás buscando:
- **Consulta de Búsqueda**: "laptop", "smartphone", "sofá", etc.
- **Buscar**: Selecciona "Productos" para artículos individuales o "Páginas" para múltiples páginas

### Opciones Avanzadas
- **Máximo de Productos/Páginas**: Limita cuántos resultados quieres (predeterminado: 25)
- **Precio Mínimo**: Filtra productos por encima de cierto precio (en COP)
- **Precio Máximo**: Filtra productos por debajo de cierto precio (en COP)

## 💡 Ejemplos de Búsqueda

### Buscar Laptops
```json
{
  "searchQuery": "laptop",
  "searchFor": "items",
  "maxProducts": 50
}
```

### Buscar Laptops Gamer Bajo 3 Millones COP
```json
{
  "searchQuery": "laptop gamer",
  "searchFor": "items",
  "maxProducts": 100,
  "maxPrice": 3000000
}
```

### Buscar Smartphones Premium
```json
{
  "searchQuery": "smartphone",
  "searchFor": "items",
  "minPrice": 1000000,
  "maxProducts": 30
}
```

### Buscar Muebles Económicos
```json
{
  "searchQuery": "muebles sala",
  "searchFor": "items",
  "maxPrice": 500000,
  "maxProducts": 50
}
```

### Extraer Todas las Páginas de Televisores
```json
{
  "searchQuery": "televisor",
  "searchFor": "pages",
  "maxProducts": 5
}
```

## 📊 Formato de Salida

Los resultados se devuelven como datos estructurados (JSON) que puedes exportar fácilmente a Excel, CSV o integrar con otras herramientas:

```json
[
  {
  "title": "JUST HOME COLLECTION - Lámpara Colgante Bombillo LED Geometric Cromado",
	"price": "$ 199.900",
	"priceNumeric": 199900,
	"oldPrice": "$ 298.358",
	"oldPriceNumeric": 298358,
	"discount": "-33%",
	"url": "https://www.falabella.com.co/falabella-co/product/122377943/Lampara-Colgante-Bombillo-LED-Geometric-Cromado/122377951",
	"image": "https://media.falabella.com.co/sodimacCO/881751_08/width=240,height=240,quality=70,format=webp,fit=pad"
  }
]
```

## ⚡ Rendimiento

- **Rápido**: Usa navegador Playwright para contenido dinámico
- **Eficiente**: Procesa cientos de productos en minutos
- **Confiable**: Construido con evasión de detección de bots
- **Inteligente**: Deduplicación en tiempo real para resultados exactos

## 🔧 Consejos para Mejores Resultados

1. **Sé Específico**: "laptop gaming" funciona mejor que solo "computador"
2. **Usa Español**: Falabella Colombia funciona mejor con términos de búsqueda en español
3. **Filtros de Precio**: Usa precio mín/máx para reducir resultados rápidamente
4. **Limita Resultados**: Establece maxProducts para evitar datos abrumadores
5. **Modo Páginas**: Usa "Páginas" cuando necesites extraer todos los productos de múltiples páginas completas

## 📝 Notas

- Los precios están en Pesos Colombianos (COP)
- Los resultados se deduplicán automáticamente en tiempo real
- La disponibilidad de productos puede cambiar después de la extracción
- Respeta la estructura del sitio web de Falabella
- El modo "Productos" extrae exactamente la cantidad especificada de productos únicos
- El modo "Páginas" extrae todos los productos de las páginas indicadas

## 🛠️ Detalles Técnicos

- **Plataforma**: Apify Actor
- **Método**: Playwright (navegador Chrome sin cabeza)
- **Velocidad**: ~25-100 productos por ejecución (dependiendo de la configuración)
- **Calidad de Datos**: Limpio, estructurado, deduplicado en tiempo real
- **Manejo de Imágenes**: Carga progresiva para garantizar todas las imágenes

## 🎯 Modos de Búsqueda

### Modo "Productos" (items)
- Extrae exactamente el número de productos únicos especificado
- Continúa navegando páginas hasta obtener la cantidad deseada
- Deduplicación en tiempo real por URL
- Ideal para: Comparación de precios, análisis de productos específicos

### Modo "Páginas" (pages)
- Extrae todos los productos de las páginas indicadas
- Ejemplo: maxProducts = 5 → extrae páginas 1, 2, 3, 4, 5 completas
- Procesa todos los productos encontrados en cada página
- Ideal para: Análisis de mercado completo, extracción masiva de datos

---

**¡Felices compras!** 🎉
