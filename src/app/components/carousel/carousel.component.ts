import { NgClass, NgStyle } from '@angular/common';
import { Component, computed, effect, input, signal, untracked } from '@angular/core';
import { Image } from './types/image.interface';

@Component({
  selector: 'app-carousel',
  imports: [
    NgStyle,
    NgClass
  ],
  templateUrl: './carousel.component.html',
  styleUrl: './carousel.component.css',
})
export class CarouselComponent {
  images = input.required<Image[]>();
  parentWidth = input<number>(800);
  numImages = computed(() => this.images().length);
  currentIndex = signal(0);
  calcContainerStyles = computed(() => ({
    width: `${this.parentWidth() * this.numImages()}px`,
    transform: `translateX(-${this.currentIndex() * this.parentWidth()}px)`,
  }));
  autoplay = signal(true);
  timeoutId = signal<number | undefined>(undefined);
  timeoutEffect = effect(onCleanup => {
    let data = this.currentIndex();
    if (!this.autoplay()) {
      return;
    }
    const prevId = untracked(() => this.timeoutId());
    window.clearTimeout(prevId);
    const id = window.setTimeout(() => {
      this.goToNext();
    }, 2000);
    untracked(() => this.timeoutId.set(id));
    onCleanup(() =>
      window.clearTimeout(id)
    );
  });

  goToPrev() {
    this.currentIndex.update(i => (this.numImages() + i - 1) % (this.numImages()));
  }

  goToNext() {
    this.currentIndex.update(i => (i + 1) % (this.numImages()));
  }

  calcImageStyle(image: Image) {
    return {
      backgroundImage: `url(${image.src})`,
      width: `${this.parentWidth()}px`
    };
  }

  goToImage($index: number) {
    this.currentIndex.set($index);
  }

  toggleAutoplay() {
    this.autoplay.update(v => !v);
  }
}
