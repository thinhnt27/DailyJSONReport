# Daily JSON Report - DDD Architecture

## 📁 Project Structure

```
src/
├── application/              # Shared application layer
│   └── common/
│       └── uow/             # Unit of Work pattern interfaces
│           └── unit-of-work.interface.ts
│
├── infra/                   # Shared infrastructure layer
│   ├── database.module.ts   # 🆕 DatabaseModule (Global)
│   └── prisma/
│       ├── prisma.service.ts
│       ├── prisma-unit-of-work.ts
│       ├── prisma-unit-of-work.spec.ts
│       └── repo-factory.prisma.ts
│
├── modules/                 # Bounded Contexts
│   ├── event-detections/    # Event Detections bounded context
│   │   ├── domain/
│   │   │   ├── event-detections.ts
│   │   │   └── repositories/
│   │   │       └── event-detections.repo.interface.ts
│   │   ├── application/
│   │   │   └── event-detections.service.ts
│   │   ├── infra/
│   │   │   └── prisma/
│   │   │       └── event-detections.repo.ts
│   │   └── event-detections.module.ts
│   │
│   └── hello/               # Hello bounded context (example)
│       ├── application/
│       │   └── hello.service.ts
│       ├── infra/
│       │   └── http/
│       │       └── hello.controller.ts
│       └── hello.module.ts
│
├── app.module.ts            # Root application module
└── main.ts                  # Application entry point
```

## 🏗️ Architecture Layers

### Domain Layer

- **Pure business logic**, no dependencies on infrastructure
- Domain entities, value objects, domain services
- Repository interfaces (ports)

### Application Layer

- Use cases / application services
- Orchestrates domain logic
- Uses repository interfaces via dependency injection

### Infrastructure Layer

- **DatabaseModule**: Shared database infrastructure
  - PrismaService (Prisma client wrapper)
  - PrismaUnitOfWork (transaction management)
  - PrismaRepoFactory (repository factory for transactions)
- Repository implementations (adapters)
- External service integrations

### Interface Layer

- HTTP controllers
- GraphQL resolvers
- Message queue consumers

## 🔧 DatabaseModule (Global Infrastructure)

The `DatabaseModule` is a **@Global** module that provides shared database infrastructure:

```typescript
@Global()
@Module({
  providers: [
    PrismaService, // Singleton Prisma client
    PrismaRepoFactory, // Factory for transactional repos
    IUNIT_OF_WORK, // Unit of Work implementation
  ],
  exports: [
    /* same */
  ],
})
export class DatabaseModule {}
```

### Benefits

- ✅ **Single registration**: Infrastructure providers registered once in AppModule
- ✅ **No duplication**: Bounded context modules don't re-register Prisma providers
- ✅ **Global availability**: @Global decorator makes it available everywhere
- ✅ **Easy testing**: Can swap DatabaseModule with TestDatabaseModule
- ✅ **Centralized config**: Single place for database configuration

### Usage in Bounded Context Modules

```typescript
@Module({
  providers: [
    // Only register domain-specific providers
    {
      provide: EVENT_DETECTIONS_REPO,
      useFactory: (prisma: PrismaService) =>
        new PrismaEventDetectionsRepo(prisma.client),
      inject: [PrismaService], // Auto-injected from DatabaseModule
    },
    EventDetectionsService,
  ],
  exports: [EventDetectionsService, EVENT_DETECTIONS_REPO],
})
export class EventDetectionsModule {}
```

## 🎯 DDD Patterns Implemented

### 1. Repository Pattern

- Interface in domain layer: `IEventDetectionsRepo`
- Implementation in infra layer: `PrismaEventDetectionsRepo`
- Dependency injection via token: `EVENT_DETECTIONS_REPO`

### 2. Unit of Work Pattern

- Interface: `IUnitOfWork` in `application/common/uow/`
- Implementation: `PrismaUnitOfWork` in `infra/prisma/`
- Manages transactions across multiple repositories

### 3. Factory Pattern

- `PrismaRepoFactory`: Creates repository instances bound to transactions

### 4. Dependency Inversion

- Domain depends on interfaces, not implementations
- Infrastructure implements domain interfaces

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run e2e tests
pnpm test:e2e

# TypeScript type check
pnpm exec tsc --noEmit
```

## 📦 Module Dependencies

```
AppModule
├── DatabaseModule (Global)
│   ├── PrismaService
│   ├── PrismaRepoFactory
│   └── PrismaUnitOfWork
├── HelloModule
└── EventDetectionsModule
    ├── PrismaEventDetectionsRepo (uses PrismaService from DatabaseModule)
    └── EventDetectionsService
```

## 🚀 Adding a New Bounded Context

1. Create module structure:

   ```
   src/modules/my-context/
   ├── domain/
   │   ├── my-context.ts
   │   └── repositories/
   │       └── my-context.repo.interface.ts
   ├── application/
   │   └── my-context.service.ts
   ├── infra/
   │   └── prisma/
   │       └── my-context.repo.ts
   └── my-context.module.ts
   ```

2. Register repository provider:

   ```typescript
   @Module({
     providers: [
       {
         provide: MY_CONTEXT_REPO,
         useFactory: (prisma: PrismaService) =>
           new PrismaMyContextRepo(prisma.client),
         inject: [PrismaService], // Already available!
       },
       MyContextService,
     ],
   })
   export class MyContextModule {}
   ```

3. Import in AppModule:
   ```typescript
   @Module({
     imports: [
       DatabaseModule,  // Already imported
       MyContextModule, // Add your module
     ],
   })
   ```

**No need to register PrismaService again!** It's provided globally by DatabaseModule.

## 📚 References

- [NestJS Modules](https://docs.nestjs.com/modules)
- [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html)
- [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)
- [Unit of Work Pattern](https://martinfowler.com/eaaCatalog/unitOfWork.html)
