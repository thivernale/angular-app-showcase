import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageService } from '../components/carousel/services/image.service';
import { Image } from '../components/carousel/types/image.interface';
import { GalleryComponent } from './gallery.component';

describe('GalleryComponent', () => {
  const mockImages = ['image1.jpg', 'image2.jpg', 'image3.jpg']
    .map(src => `https://example.com/${src}`)
    .map(src => ({ src, alt: '' } as Image));

  let mockImageService: Partial<ImageService>;

  beforeEach(async () => {
    // Mock ImageService
    mockImageService = {
      images: signal(mockImages),
    };

    await render(GalleryComponent, {
      componentProviders: [
        { provide: ImageService, useValue: mockImageService },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create the component', () => {
    const componentElement = screen.getByTestId('carousel');

    expect(componentElement).toBeTruthy();
  });

  it('should initialize images with values from ImageService', () => {
    const component = screen.getByTestId('carousel');
    const slideElements = component.querySelectorAll('.slide');

    expect(slideElements.length).toBe(3);

    slideElements.forEach((slide, index) => {
      expect(window.getComputedStyle(slideElements.item(index)).getPropertyValue('background-image'))
        .toBe(`url("${(mockImages[index].src)}")`);
    });
  });
});
