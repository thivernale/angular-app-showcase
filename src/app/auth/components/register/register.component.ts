import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from '@angular/router';
import { AlertService } from '../../../components/alert/services/alert.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);

  protected form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    email: ['', Validators.required],
    password: ['', Validators.required],
  });

  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  protected onSubmit() {
    this.authService.register(this.form.getRawValue()).subscribe({
      next: async () => {
        await this.router.navigateByUrl('/');
      },
      error: (error: Error) => {
        this.alertService.showAlert({
          type: 'danger',
          text: `Error registering user: ${error.message}`
        })
      }
    });
  }
}
