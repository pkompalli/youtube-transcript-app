import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AppProvider } from './src/context/AppContext';
import { HomeScreen } from './src/screens/HomeScreen';
import { VideoSummaryScreen } from './src/screens/VideoSummaryScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <AppProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="VideoSummary" component={VideoSummaryScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </AppProvider>
  );
}


