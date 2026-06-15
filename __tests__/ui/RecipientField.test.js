import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import RecipientField from '../../src/ui/RecipientField';

test('commits a typed address on a separator and removes a chip', () => {
  const onChange = jest.fn();
  const {getByPlaceholderText, rerender, getByText, getByLabelText} = render(
    <RecipientField label="To" placeholder="To" value={[]} onChange={onChange} />,
  );
  fireEvent.changeText(getByPlaceholderText('To'), 'a@x.com,');
  expect(onChange).toHaveBeenCalledWith(['a@x.com']);

  rerender(
    <RecipientField label="To" placeholder="To" value={['a@x.com']} onChange={onChange} />,
  );
  expect(getByText(/a@x\.com/)).toBeTruthy();
  fireEvent.press(getByLabelText('Remove a@x.com'));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

test('commits the remaining text on blur', () => {
  const onChange = jest.fn();
  const {getByPlaceholderText} = render(
    <RecipientField label="To" placeholder="To" value={[]} onChange={onChange} />,
  );
  fireEvent.changeText(getByPlaceholderText('To'), 'bob@y.com');
  fireEvent(getByPlaceholderText('To'), 'blur');
  expect(onChange).toHaveBeenCalledWith(['bob@y.com']);
});

test('does not commit an in-progress trailing token after a separator', () => {
  const onChange = jest.fn();
  const {getByPlaceholderText} = render(
    <RecipientField label="To" placeholder="To" value={[]} onChange={onChange} />,
  );
  // typing 'a@x.com,b' commits only the completed 'a@x.com'; 'b' stays in the field
  fireEvent.changeText(getByPlaceholderText('To'), 'a@x.com,b');
  expect(onChange).toHaveBeenCalledWith(['a@x.com']);
  expect(getByPlaceholderText('To').props.value).toBe('b');
});
