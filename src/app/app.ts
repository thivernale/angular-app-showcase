import { Component, signal } from '@angular/core';
import { MainComponent } from './components/main/main.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';

@Component({
  selector: 'app-root',
  imports: [SidebarComponent, MainComponent],
  templateUrl: './app.html',
  host: { '(window:resize)': 'onResize($event)' },
})
export class App {
  readonly screenWidth = signal<number>(window.innerWidth);
  readonly isSidebarCollapsed = signal<boolean>(this.isScreenWidthBelowMd());

  onResize(event: Event) {
    this.screenWidth.set((event.target as Window).innerWidth);
    if (this.isScreenWidthBelowMd()) {
      this.isSidebarCollapsed.set(true);
    }
  }

  protected toggleSidebarCollapsed(value: boolean) {
    this.isSidebarCollapsed.set(value);
  }

  private isScreenWidthBelowMd() {
    return this.screenWidth() < 768;
  }
}
