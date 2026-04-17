import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CarouselComponent } from './carousel.component';
import { Image } from './types/image.interface';

describe('CarouselComponent', () => {
  let component: CarouselComponent;
  let fixture: ComponentFixture<CarouselComponent>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(CarouselComponent, {});
    fixture.componentRef.setInput('images', [
      { src: 'image1.jpg', alt: 'Image 1' },
      { src: 'image2.jpg', alt: 'Image 2' },
      { src: 'image3.jpg', alt: 'Image 3' },
    ]);
    fixture.componentRef.setInput('parentWidth', 800);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create an instance of CarouselComponent', () => {
    expect(component).toBeTruthy();
  });

  it('should calculate container styles correctly', () => {
    component.currentIndex.set(1);
    const styles = component.calcContainerStyles();
    expect(styles).toEqual({
      width: '2400px',
      transform: 'translateX(-800px)',
    });
  });

  it('should go to the previous image', () => {
    component.currentIndex.set(0);
    component.goToPrev();
    expect(component.currentIndex()).toBe(2);
  });

  it('should go to the next image', () => {
    component.currentIndex.set(2);
    component.goToNext();
    expect(component.currentIndex()).toBe(0);
  });

  it('should calculate individual image styles correctly', () => {
    const image: Image = { src: 'image1.jpg', alt: 'Image 1' };
    const styles = component.calcImageStyle(image);
    expect(styles).toEqual({
      backgroundImage: 'url(image1.jpg)',
      width: '800px',
    });
  });

  it('should navigate to a specific image index', () => {
    component.goToImage(1);
    expect(component.currentIndex()).toBe(1);
  });
});
