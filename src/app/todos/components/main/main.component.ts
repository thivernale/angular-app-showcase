import { NgClass } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { TodosService } from '../../services/todos.service';
import { StateFilter } from '../../types/state-filter';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  imports: [
    NgClass
  ]
})
export class MainComponent {
  private readonly service = inject(TodosService);
  private readonly todosSignal = this.service.todos;
  private readonly stateFilterSignal = this.service.stateFilterSignal;

  protected visibleTodosSignal = computed(
    () => this.todosSignal().filter(t =>
      t.isCompleted && this.stateFilterSignal() === StateFilter.COMPLETED ||
      !t.isCompleted && this.stateFilterSignal() === StateFilter.ACTIVE ||
      this.stateFilterSignal() === StateFilter.ALL)
  );

  constructor() {
    this.service.add('Initial todo');
    this.service.update({ ... this.service.todos()[0], isCompleted: true });
  }
}
