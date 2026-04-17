export interface Image {
  src: string;
  alt: string;
}

export interface ImageResponse {
  'id': string;
  'author': string;
  'width': number;
  'height': number;
  'url': string;
  'download_url': string;
}
