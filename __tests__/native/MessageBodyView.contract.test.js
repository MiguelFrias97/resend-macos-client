jest.mock('react-native', () => ({requireNativeComponent: name => name}));
import MessageBodyView from '../../src/native/MessageBodyView';
test('exports a native component reference', () => {
  expect(MessageBodyView).toBeDefined();
});
