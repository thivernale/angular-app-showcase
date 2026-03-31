import { NgClass } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { routingLinkOptions } from '../../app.routes';

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    NgClass
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  isSidebarCollapsed = input.required<boolean>();
  toggleSidebarCollapsed = output<boolean>();
  protected readonly menuItems = routingLinkOptions;

  toggleSidebar() {
    this.toggleSidebarCollapsed.emit(!this.isSidebarCollapsed());
  }
}
