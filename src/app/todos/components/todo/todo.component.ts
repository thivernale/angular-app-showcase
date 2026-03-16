import { NgClass } from '@angular/common';
import { Component, effect, ElementRef, inject, input, linkedSignal, output, viewChild, } from '@angular/core';
import { TodosService } from '../../services/todos.service';
import { Todo } from '../../types/todo.interface';

@Component({
  selector: 'app-todo',
  templateUrl: './todo.component.html',
  imports: [
    NgClass
  ]
})
export class TodoComponent {
  private readonly service = inject(TodosService);
  todoInput = input.required<Todo>();
  textComputed = linkedSignal(() => this.todoInput().content);
  editMode = input(false);
  setEditId = output<string | null>();
  inputRef = viewChild<ElementRef<HTMLInputElement>>('editInput');

  constructor() {
    effect(() => {
      const input = this.inputRef();
      if (input) {
        input.nativeElement.focus();
      }
    });
  }

  protected changeText($event: KeyboardEvent): void {
    if ($event.key === 'Escape') {
      this.textComputed.set(this.todoInput().content);
      this.setEditId.emit(null);
      return;
    }
    this.textComputed.set(($event.target as HTMLInputElement).value);
  }

  protected toggleCompleted() {
    this.service.toggleCompleted(this.todoInput().id);
  }

  protected saveEdit() {
    this.service.update({ ...this.todoInput(), content: this.textComputed() });
    this.setEditId.emit(null);
  }

  protected remove() {
    this.service.remove(this.todoInput().id);
  }
}
