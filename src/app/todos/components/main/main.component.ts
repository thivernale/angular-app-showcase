import { NgClass } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { TodosService } from '../../services/todos.service';
import { StateFilter } from '../../types/state-filter';
import { TodoComponent } from '../todo/todo.component';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  imports: [
    NgClass,
    TodoComponent
  ]
})
export class MainComponent {
  private readonly service = inject(TodosService);
  private readonly todosSignal = this.service.todos;
  private readonly stateFilterSignal = this.service.stateFilterSignal;
  protected readonly editIdSignal = signal<string | null>(null);

  protected visibleTodosSignal = computed(
    () => this.todosSignal().filter(t =>
      t.isCompleted && this.stateFilterSignal() === StateFilter.COMPLETED ||
      !t.isCompleted && this.stateFilterSignal() === StateFilter.ACTIVE ||
      this.stateFilterSignal() === StateFilter.ALL)
  );

  // TODO remove sample data
  constructor() {
    this.service.add('Initial todo');
    this.service.add('Second todo');
    this.service.update({ ... this.service.todos()[0], isCompleted: true });
  }
}
