import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertService } from '../../../components/alert/services/alert.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);

  protected form = this.fb.nonNullable.group({
    email: ['', Validators.required],
    password: ['', Validators.required],
  });

  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  protected onSubmit() {
    this.authService.login(this.form.getRawValue()).subscribe({
      next: async () => {
        await this.router.navigateByUrl('/');
      },
      error: (error: Error) => {
        this.alertService.showAlert({
          type: 'danger',
          text: `Error logging in user: ${error.message}`
        })
      }
    });
  }
}
