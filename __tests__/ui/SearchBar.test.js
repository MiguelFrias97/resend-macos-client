import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import SearchBar from '../../src/ui/SearchBar';

test('reports query changes', () => {
  const onChange = jest.fn();
  const {getByPlaceholderText} = render(<SearchBar value="" onChange={onChange} />);
  fireEvent.changeText(getByPlaceholderText('Search'), 'deal');
  expect(onChange).toHaveBeenCalledWith('deal');
});
