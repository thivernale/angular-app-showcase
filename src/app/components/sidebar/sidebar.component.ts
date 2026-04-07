import { NgClass } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { routingLinkOptions } from '../../app.routes';
import { authRoutingLinkOptions } from '../../auth/routes/auth-routes';
import { AuthService } from '../../auth/services/auth.service';
import { ClickOutsideDirective } from '../../directives/click-outside.directive';

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    NgClass,
    ClickOutsideDirective
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  isSidebarCollapsed = input.required<boolean>();
  toggleSidebarCollapsed = output<boolean>();
  protected readonly menuItems = routingLinkOptions;
  protected readonly authMenuItems = authRoutingLinkOptions;
  protected readonly authService = inject(AuthService);
  private readonly fetchCurrentUserSignal = toSignal(this.authService.getCurrentUser());
  protected currentUserSignal = computed(() =>
    this.authService.currentUserSignal() === undefined ? this.fetchCurrentUserSignal() : this.authService.currentUserSignal()
  );

  toggleSidebar() {
    this.toggleSidebarCollapsed.emit(!this.isSidebarCollapsed());
  }

  protected logout() {
    this.authService.logout();
  }

  protected collapseSidebar() {
    if (!this.isSidebarCollapsed()) {
      this.toggleSidebarCollapsed.emit(true);
    }
  }
}
