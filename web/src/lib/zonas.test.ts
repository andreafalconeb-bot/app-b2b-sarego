import { describe, expect, it } from 'vitest'
import { OTRA_ZONA, SIN_UBICACION, ordenZona, zonaDe } from './zonas'

describe('zonaDe', () => {
  it('sin coordenadas', () => {
    expect(zonaDe(null, -66.9)).toBe(SIN_UBICACION)
  })
  it('sectores de Caracas', () => {
    expect(zonaDe(10.5115, -66.949)).toBe('Caracas · Catia y Propatria')
    expect(zonaDe(10.4778, -66.9649)).toBe('Caracas · La Yaguara, Carapa y Antímano')
    expect(zonaDe(10.4544, -66.9142)).toBe('Caracas · El Valle, Coche y Fuerte Tiuna')
  })
  it('Caracas fuera de los sectores', () => {
    expect(zonaDe(10.5206, -66.9953)).toBe('Caracas · Otros sectores')
  })
  it('otras ciudades', () => {
    expect(zonaDe(8.2933, -62.7286)).toBe('Puerto Ordaz')
    expect(zonaDe(10.241, -66.849)).toBe('Valles del Tuy')
    expect(zonaDe(10.66, -71.61)).toBe(OTRA_ZONA)
  })
  it('las genéricas van al final', () => {
    expect(ordenZona('Caracas · Catia y Propatria')).toBeLessThan(ordenZona('Caracas · Otros sectores'))
    expect(ordenZona('Caracas · Otros sectores')).toBeLessThan(ordenZona('Valles del Tuy'))
    expect(ordenZona(OTRA_ZONA)).toBeLessThan(ordenZona(SIN_UBICACION))
  })
})
