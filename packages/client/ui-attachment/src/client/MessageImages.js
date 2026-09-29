import { ImageGallery } from '../MessageImage.js'
import { messageImageLabels } from './labels.js'

export function MessageImages({ images, loadImage, align, t }) {
  return ImageGallery({ images, load: loadImage, align, labels: messageImageLabels(t) })
}
