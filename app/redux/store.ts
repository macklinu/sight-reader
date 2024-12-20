import { configureStore, createAsyncThunk } from '@reduxjs/toolkit'
import { useDispatch } from 'react-redux'

import { listenerMiddleware } from './listener-middleware'

export const store = configureStore({
  reducer: {},
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
})

export type AppDispatch = typeof store.dispatch
export const useAppDispatch = useDispatch.withTypes<AppDispatch>() // Export a hook that can be reused to resolve types
export type RootState = ReturnType<typeof store.getState>

export const createAppAsyncThunk = createAsyncThunk.withTypes<{
  state: RootState
  dispatch: AppDispatch
}>()
