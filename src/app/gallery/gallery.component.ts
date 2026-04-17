import { Component, inject } from '@angular/core';
import { CarouselComponent } from '../components/carousel/carousel.component';
import { ImageService } from '../components/carousel/services/image.service';

@Component({
  selector: 'app-gallery',
  imports: [
    CarouselComponent
  ],
  templateUrl: './gallery.component.html',
})
export class GalleryComponent {
  private readonly imageService = inject(ImageService);
  protected images = this.imageService.images;
}
