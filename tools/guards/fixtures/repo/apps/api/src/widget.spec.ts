import { WidgetService } from './widget';

test('lists', () => expect(new WidgetService().listWidgets()).toEqual([]));
