import qrcode from 'qrcode-generator';

/**
 * A QR code as an SVG element, or undefined when the text is too long for
 * one. The markup is made of rectangles this library writes itself.
 */
// Four quiet-zone modules, each rendered at four SVG units.
export function qrSvg(text: string, label: string, margin = 16): HTMLElement | undefined {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  try {
    qr.make();
  } catch {
    return undefined;
  }
  const holder = document.createElement('div');
  holder.className = 'qr';
  holder.setAttribute('role', 'img');
  holder.setAttribute('aria-label', label);
  holder.innerHTML = qr.createSvgTag({ cellSize: 4, margin, scalable: true });
  return holder;
}
