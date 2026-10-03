/** Plan each delivery line against the preceding line's stock, including repeated products. */
export function planDeliveryStock(
  lines: { product_id: string; quantity: number }[],
  products: { id: string; current_stock: number | null }[],
) {
  const stocks = new Map(products.map(product => [product.id, Number(product.current_stock) || 0]));
  return lines.filter(line => line.product_id && line.quantity > 0).map(line => {
    const previousStock = stocks.get(line.product_id);
    if (previousStock === undefined) throw new Error('A delivery product is unavailable. Reload the delivery note.');
    if (!Number.isFinite(line.quantity)) throw new Error('Enter a valid delivery quantity.');
    const newStock = Math.max(0, previousStock - line.quantity);
    stocks.set(line.product_id, newStock);
    return { productId: line.product_id, quantity: line.quantity, previousStock, newStock };
  });
}
