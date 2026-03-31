import { NgClass } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterOutlet } from "@angular/router";

@Component({
  selector: 'app-main',
  imports: [
    RouterOutlet,
    NgClass
  ],
  templateUrl: './main.component.html',
  styleUrl: './main.component.css',
})
export class MainComponent {
  isSidebarCollapsed = input.required<boolean>();
  screenWidth = input.required<number>();
  readonly sizeClass = computed<string>(
    () => {
      if (this.isSidebarCollapsed()) {
        return '';
      }
      return this.screenWidth() < 768 ? 'body-md-screen' : 'body-trimmed';
    }
  );
}
