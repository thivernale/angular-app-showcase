import { Component, inject } from '@angular/core';
import { TodosService } from '../../services/todos.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
})
export class HeaderComponent {
  protected text: string = '';
  private readonly service = inject(TodosService);

  protected changeText($event: KeyboardEvent): void {
    this.text = ($event.target as HTMLInputElement).value;
  }

  protected addTodo(): void {
    this.service.add(this.text);
    this.text = '';
  }
}
