import cv from './jsfeat.mjs';

const diameter = 31;
const spans = Array.from({length: diameter}, (_, i) => Math.floor(Math.sqrt(225 - (i-15)**2)));

function orientation(image, x, y) {
  let horizontal = 0, vertical = 0;
  for (let dy = -15; dy <= 15; dy++) {
    const reach = spans[dy + 15];
    const center = (y+dy)*image.cols + x;
    let sum = 0;
    for (let dx = -reach; dx <= reach; dx++) {
      const value = image.data[center+dx];
      horizontal += dx * value;
      sum += value;
    }
    vertical += dy * sum;
  }
  return Math.atan2(vertical, horizontal);
}

export function createExtractor() {
  const grey = new cv.matrix_t(1,1,cv.U8C1_t);
  const soft = new cv.matrix_t(1,1,cv.U8C1_t);
  const smooth = new cv.matrix_t(1,1,cv.U8C1_t);
  const descriptors = new cv.matrix_t(32,1,cv.U8C1_t);
  const pool = [];
  cv.fast_corners.set_threshold(12);
  return function extract(frame, limit) {
    const {width, height, data} = frame;
    grey.resize(width, height, 1);
    soft.resize(width, height, 1);
    smooth.resize(width, height, 1);
    if (data.length === width*height) {
      grey.data.set(data);
    } else {
      cv.imgproc.grayscale(data,width,height,grey);
    }
    // FAST's 3×3 strict local maxima cannot be immediate neighbors.
    const capacity = Math.ceil(width/2)*Math.ceil(height/2);
    for (let i = pool.length; i < capacity; i++) pool.push({});
    cv.imgproc.gaussian_blur(grey, soft, 3, .85);
    cv.imgproc.gaussian_blur(soft, smooth, 5, 1.25);
    const n = cv.fast_corners.detect(soft, pool, 19);
    const candidates = pool.slice(0,n).sort((a,b) => b.score - a.score);
    // Suppress neighboring duplicate keypoints while preserving textured small faces.
    const cell = 5, columns = Math.ceil(width/cell);
    const occupied = new Uint8Array(columns*Math.ceil(height/cell));
    const points = [];
    for (const point of candidates) {
      const cellId = Math.floor(point.y/cell)*columns + Math.floor(point.x/cell);
      if (occupied[cellId]) continue;
      occupied[cellId] = 1;
      point.angle = orientation(soft,point.x,point.y);
      points.push(point);
      if (points.length >= limit) break;
    }
    cv.orb.describe(smooth,points,points.length,descriptors);
    return {points, words: new Uint32Array(descriptors.data.buffer, descriptors.data.byteOffset, points.length*8)};
  };
}
