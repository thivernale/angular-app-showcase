import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ImageService } from './image.service';

describe('ImageService', () => {
  let service: ImageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ImageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should call image API with correct URL', async () => {
    const mockBackend = TestBed.inject(HttpTestingController);

    TestBed.tick(); // Triggers the effect (fires the HTTP request)

    // Use match instead of expectOne to capture the duplicates
    const requests = mockBackend.match(service.apiUrl);
    expect(requests.length).toBe(2);

    const firstRequest = requests[0];
    expect(firstRequest.request.method).toBe('GET');
    firstRequest.flush([{ id: '0', author: 'Unknown Author', download_url: 'https://example.com/image1.jpg' }]);

    // Ensures the values are propagated to the httpResource - not working
    // await TestBed.inject(ApplicationRef).whenStable();
    // Let the microtask queue drain again so the value propagates back to the signal
    await Promise.resolve();

    expect(service.httpResourceRef.value()).toEqual([{
      id: '0',
      author: 'Unknown Author',
      download_url: 'https://example.com/image1.jpg'
    }]);

    mockBackend.verify();
  });
});
