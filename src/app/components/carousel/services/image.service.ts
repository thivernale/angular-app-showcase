import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Image, ImageResponse } from '../types/image.interface';

@Injectable({
  providedIn: 'root',
})
export class ImageService {

  readonly apiUrl = `https://picsum.photos/v2/list?limit=10&page=${Math.round(Math.random() * 10)}`;

  httpResourceRef = httpResource<Image[]>(
    () => this.apiUrl,
    {
      parse: (response: unknown) => (response as ImageResponse[]).map(this.imageMapper),
    }
  );
  isLoading = this.httpResourceRef.isLoading;
  error = computed(() => this.httpResourceRef.error() as HttpErrorResponse);
  images = computed<Image[]>(() => this.httpResourceRef.hasValue() ? this.httpResourceRef.value() : []);

  private readonly http = inject(HttpClient);

  private readonly imageMapper: (response: ImageResponse) => Image = ({ download_url, author, id }: ImageResponse) => ({
    src: download_url,
    alt: `${id} by ${author}`
  }) as Image;

  getImages() {
    return this.http.get<ImageResponse[]>(this.apiUrl).pipe(
      map(response => response.map(this.imageMapper))
    );
  }

  rxResourceRef = rxResource<Image[], void>({
    stream: this.getImages
  });
}
