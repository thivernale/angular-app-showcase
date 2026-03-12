import { NgClass } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { TodosService } from '../../services/todos.service';
import { StateFilter, StateFilterLabels } from '../../types/state-filter';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  imports: [
    NgClass
  ]
})
export class FooterComponent {
  private readonly service = inject(TodosService);
  protected readonly stateFilterSignal = this.service.stateFilterSignal.asReadonly();

  protected readonly stateFilterEntries = Object.entries(StateFilterLabels);

  protected numActiveTodos = computed(() => this.service.todos().filter(t => !t.isCompleted).length);
  protected noTodos = computed(() => this.service.todos().length === 0);

  protected changeFilter(filter: string): void {
    this.service.setFilter(filter as StateFilter);
  }
}
