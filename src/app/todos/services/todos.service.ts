import { inject, Injectable, signal } from '@angular/core';
import { AlertService } from '../../components/alert/services/alert.service';
import { StateFilter } from '../types/state-filter';
import { Todo } from '../types/todo.interface';

@Injectable({
  providedIn: 'root'
})
export class TodosService {
  readonly stateFilterSignal = signal<StateFilter>(StateFilter.ALL);
  private readonly todosSignal = signal<Todo[]>([]);
  readonly todos = this.todosSignal.asReadonly();
  private readonly alertService = inject(AlertService);

  add(content: string) {
    const updateFn = (todos: Todo[]) => [...todos, { id: this.generateId(), content, isCompleted: false }];
    this.updateSignal(updateFn);

    this.alertService.showAlert({
      type: 'success',
      text: `Todo added: ${content}!`
    })
  }

  update(todo: Todo) {
    const updateFn = (todos: Todo[]) => [...todos.map(t => t.id === todo.id ? todo : t)];
    this.updateSignal(updateFn);

    this.alertService.showAlert({
      type: 'success',
      text: `Todo updated: ${todo.content}!`
    })
  }

  remove(id: string) {
    const updateFn = (todos: Todo[]) => [...todos.filter(t => t.id !== id)];
    this.updateSignal(updateFn);

    this.alertService.showAlert({
      type: 'success',
      text: `Todo removed: ${id}!`
    })
  }

  toggleCompleted(id: string) {
    const updateFn = (todos: Todo[]) => [...todos.map(t => t.id === id ? { ...t, isCompleted: !t.isCompleted } : t)];
    this.updateSignal(updateFn);

    this.alertService.showAlert({
      type: 'success',
      text: `Todo completed: ${id}!`
    })
  }

  toggleAllCompleted(isCompleted: boolean) {
    const updateFn = (todos: Todo[]) => [...todos.map(t => ({ ...t, isCompleted }))];
    this.updateSignal(updateFn);

    this.alertService.showAlert({
      type: 'success',
      text: `All todos toggled ${isCompleted ? 'completed' : 'not completed'}!`
    })
  }

  setFilter(stateFilter: StateFilter) {
    this.stateFilterSignal.set(stateFilter);
  }

  private updateSignal(updateFn: (todos: Todo[]) => Todo[]) {
    this.todosSignal.update(updateFn);
  }

  private generateId() {
    return Math.random().toString(36).slice(2, 9);
  }
}
